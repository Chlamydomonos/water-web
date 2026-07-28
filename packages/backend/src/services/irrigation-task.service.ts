/**
 * IrrigationTaskService — 灌溉任务管理 & 调度服务
 *
 * 负责三类灌溉任务的 CRUD、状态转换，以及每秒调度循环。
 *
 * 优先级: MANUAL(0) > HUMIDITY(1) > TIMED(2)
 *
 * 参考: docs/backend-design.md §4 灌溉任务管理
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { TcpClient } from '../tcp/tcp-client.js';
import type { DataService } from './data.service.js';
import { isCalibrating } from './sensor.service.js';
import { IrrigationTask } from '../db/models/IrrigationTask.js';
import { ManualTaskConfig } from '../db/models/ManualTaskConfig.js';
import { HumidityTaskConfig } from '../db/models/HumidityTaskConfig.js';
import { TimedTaskConfig } from '../db/models/TimedTaskConfig.js';
import { Sensor } from '../db/models/Sensor.js';
import { Op } from '@sequelize/core';
import type {
    IrrigationTaskDto,
    ManualTaskConfigDto,
    HumidityTaskConfigDto,
    TimedTaskConfigDto,
    TaskType,
    TaskState,
    TaskCreateRequest,
} from 'shared';

// ============================================================
// 优先级常量
// ============================================================

const PRIORITY_MANUAL = 0 as const;
const PRIORITY_HUMIDITY = 1 as const;
const PRIORITY_TIMED = 2 as const;

// ============================================================
// 业务错误
// ============================================================

export class TaskError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'TaskError';
    }
}

// ============================================================
// IrrigationTaskService
// ============================================================

export class IrrigationTaskService {
    /** 调度器循环定时器 (每秒) */
    private schedulerTimer: ReturnType<typeof setInterval> | null = null;

    /** 防止并发调度 */
    private scheduling = false;

    constructor(
        private readonly tcpClient: TcpClient,
        private readonly dataService: DataService,
        private readonly io: SocketIOServer,
    ) {}

    // ============================================================
    // 生命周期
    // ============================================================

    /** 启动每秒调度器 */
    startScheduler(): void {
        if (this.schedulerTimer) return;
        console.log('[task] starting 1s irrigation scheduler');
        this.schedulerTimer = setInterval(() => {
            this.runScheduler();
        }, 1000);
    }

    /** 停止调度器 */
    stopScheduler(): void {
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = null;
            console.log('[task] scheduler stopped');
        }
    }

    // ============================================================
    // 校准生命周期回调 (由 SensorService 在 start/stop 时调用)
    // ============================================================

    /** 进入校准模式：暂停所有正在运行的任务 */
    async onCalibrationStart(): Promise<void> {
        const runningTasks = await IrrigationTask.findAll({
            where: { state: { [Op.in]: ['running'] } },
        });

        for (const task of runningTasks) {
            task.state = 'paused';
            task.suspendedByTaskId = null; // 由校准暂停
            await task.save();
        }

        if (runningTasks.length > 0) {
            console.log(`[task] calibration: paused ${runningTasks.length} running tasks`);
        }
    }

    /** 退出校准模式：恢复被校准暂停的任务 (suspendedByTaskId === null 的 paused 任务) */
    async onCalibrationStop(): Promise<void> {
        const pausedByCalibration = await IrrigationTask.findAll({
            where: {
                state: 'paused',
                suspendedByTaskId: null,
            },
        });

        for (const task of pausedByCalibration) {
            await this.tryResume(task);
        }

        if (pausedByCalibration.length > 0) {
            console.log(`[task] calibration ended: resumed ${pausedByCalibration.length} tasks`);
        }
    }

    // ============================================================
    // CRUD
    // ============================================================

    /** 列出所有任务 (含关联配置) */
    async list(type?: TaskType, state?: TaskState): Promise<IrrigationTaskDto[]> {
        const where: Record<string, unknown> = {};
        if (type) where.type = type;
        if (state) where.state = state;

        const tasks = await IrrigationTask.findAll({
            where,
            order: [
                ['priority', 'ASC'],
                ['createdAt', 'DESC'],
            ],
        });

        const results: IrrigationTaskDto[] = [];
        for (const task of tasks) {
            const config = await this.loadConfig(task);
            results.push(toTaskDto(task, config));
        }
        return results;
    }

    /** 获取单个任务详情 */
    async detail(id: number): Promise<IrrigationTaskDto | null> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) return null;
        const config = await this.loadConfig(task);
        return toTaskDto(task, config);
    }

    /** 创建任务 */
    async create(req: TaskCreateRequest): Promise<IrrigationTaskDto> {
        // ── 校验：校准期间不允许创建 ──
        if (isCalibrating()) {
            throw new TaskError('CALIBRATION_IN_PROGRESS', '传感器正在校准中，无法创建灌溉任务');
        }

        this.validateConfig(req.type, req.config);

        // ── 校验：湿度任务唯一 ──
        if (req.type === 'humidity') {
            const existing = await IrrigationTask.findOne({
                where: {
                    type: 'humidity',
                    state: { [Op.notIn]: ['completed', 'cancelled'] },
                },
            });
            if (existing) {
                throw new TaskError('DUPLICATE_HUMIDITY_TASK', '已存在一个活跃的湿度任务');
            }
        }

        // ── 校验：定时任务时间不重叠 ──
        if (req.type === 'timed') {
            await this.validateTimedNoOverlap(req.config as TimedTaskConfigDto);
        }

        // ── 创建 ──
        const priority = this.getPriority(req.type);
        const task = await IrrigationTask.create({ type: req.type, priority });

        // 创建关联配置
        await this.createConfig(task.id, req.type, req.config);

        // 初始化状态：存在湿度任务 + 有健康传感器 → timed 进入 blocked
        if (req.type === 'timed') {
            const humidityActive = await this.isHumidityActive();
            if (humidityActive) {
                task.state = 'blocked';
                await task.save();
            }
        }

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 更新任务配置 (仅 idle/paused 可更新) */
    async update(
        id: number,
        config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto,
    ): Promise<IrrigationTaskDto> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');

        if (task.state !== 'idle' && task.state !== 'paused') {
            throw new TaskError('TASK_CANNOT_UPDATE', '仅 idle/paused 状态可更新配置');
        }

        this.validateConfig(task.type as TaskType, config);

        // 删除旧配置 → 创建新配置
        await this.deleteConfig(task.id, task.type as TaskType);
        await this.createConfig(task.id, task.type as TaskType, config);

        const newConfig = await this.loadConfig(task);
        const dto = toTaskDto(task, newConfig);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 删除任务 (仅 idle/completed/cancelled 可删除) */
    async delete(id: number): Promise<boolean> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');

        if (task.state !== 'idle' && task.state !== 'completed' && task.state !== 'cancelled') {
            throw new TaskError('TASK_CANNOT_UPDATE', '仅 idle/completed/cancelled 状态可删除');
        }

        await task.destroy();
        return true;
    }

    // ============================================================
    // 状态转换
    // ============================================================

    /** 手动启动 (manual 类型) */
    async start(id: number): Promise<IrrigationTaskDto> {
        if (isCalibrating()) throw new TaskError('CALIBRATION_IN_PROGRESS', '传感器正在校准中，无法启动任务');

        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');
        if (task.type !== 'manual') throw new TaskError('TASK_CANNOT_START', '仅 manual 类型可手动启动');
        if (task.state !== 'idle') throw new TaskError('TASK_CANNOT_START', '仅 idle 状态可启动');

        task.state = 'running';
        task.startedAt = new Date();
        await task.save();

        // 抢占：暂停所有其他 running 任务
        await this.preemptLowerPriorityTasks(task.id);

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 暂停任务 */
    async pause(id: number): Promise<IrrigationTaskDto> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');
        if (task.state !== 'running') throw new TaskError('TASK_CANNOT_UPDATE', '仅 running 状态可暂停');

        task.state = 'paused';
        task.suspendedByTaskId = null; // 用户手动暂停
        await task.save();

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 恢复任务 */
    async resume(id: number): Promise<IrrigationTaskDto> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');
        if (task.state !== 'paused') throw new TaskError('TASK_CANNOT_UPDATE', '仅 paused 状态可恢复');

        await this.tryResume(task);

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 取消任务 */
    async cancel(id: number): Promise<IrrigationTaskDto> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');
        if (task.state === 'completed' || task.state === 'cancelled') {
            throw new TaskError('TASK_CANNOT_UPDATE', '已完成/已取消的任务不可再取消');
        }

        const wasRunning = task.state === 'running';

        task.state = 'cancelled';
        task.endedAt = new Date();
        await task.save();

        // 如果是 running 状态被取消 → 恢复被它抢占的任务
        if (wasRunning) {
            await this.resumePreemptedTasks(task.id);
        }

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    /** 手动结束 (manual 类型) */
    async stop(id: number): Promise<IrrigationTaskDto> {
        const task = await IrrigationTask.findByPk(id);
        if (!task) throw new TaskError('TASK_NOT_FOUND', '灌溉任务不存在');
        if (task.type !== 'manual') throw new TaskError('TASK_CANNOT_UPDATE', '仅 manual 类型可手动结束');
        if (task.state !== 'running') throw new TaskError('TASK_CANNOT_UPDATE', '仅 running 状态可结束');

        task.state = 'completed';
        task.endedAt = new Date();
        await task.save();

        // 恢复被它抢占的任务
        await this.resumePreemptedTasks(task.id);

        const config = await this.loadConfig(task);
        const dto = toTaskDto(task, config);
        this.io.emit('task:changed', dto);
        return dto;
    }

    // ============================================================
    // 调度循环 (每秒执行)
    // ============================================================

    private async runScheduler(): Promise<void> {
        if (this.scheduling) return; // 防止并发
        this.scheduling = true;

        try {
            // 校准期间跳过调度
            if (isCalibrating()) return;

            // 1. 扫描 manual 任务
            await this.scheduleManualTasks();

            // 2. 扫描 humidity 任务
            await this.scheduleHumidityTasks();

            // 3. 扫描 timed 任务
            await this.scheduleTimedTasks();

            // 4. 应用阀门状态
            await this.applyValve();
        } catch (err) {
            console.error('[task] scheduler error:', err);
        } finally {
            this.scheduling = false;
        }
    }

    /** 步骤 1: 扫描 manual 任务 — 检查 duration 到期 */
    private async scheduleManualTasks(): Promise<void> {
        const running = await IrrigationTask.findAll({
            where: { type: 'manual', state: 'running' },
        });

        for (const task of running) {
            const config = await ManualTaskConfig.findByPk(task.id);
            if (!config || !task.startedAt) continue;

            const elapsed = (Date.now() - task.startedAt.getTime()) / 1000;
            if (elapsed >= config.durationSeconds) {
                task.state = 'completed';
                task.endedAt = new Date();
                await task.save();
                this.io.emit(
                    'task:changed',
                    toTaskDto(task, {
                        durationSeconds: config.durationSeconds,
                    }),
                );

                // 恢复被它抢占的任务
                await this.resumePreemptedTasks(task.id);
                console.log(`[task] manual #${task.id} completed (duration reached)`);
            }
        }
    }

    /** 步骤 2: 扫描 humidity 任务 */
    private async scheduleHumidityTasks(): Promise<void> {
        // 检查健康传感器数量
        const healthyCount = await Sensor.count({ where: { faulty: 0 } });

        const humidityTasks = await IrrigationTask.findAll({
            where: {
                type: 'humidity',
                state: { [Op.in]: ['idle', 'running', 'paused'] },
            },
        });

        for (const task of humidityTasks) {
            const config = await HumidityTaskConfig.findByPk(task.id);
            if (!config) continue;

            // 全传感器故障 → 暂停
            if (healthyCount === 0) {
                if (task.state === 'running' || task.state === 'idle') {
                    task.state = 'paused';
                    task.suspendedByTaskId = null; // 系统暂停
                    await task.save();
                    this.io.emit(
                        'task:changed',
                        toTaskDto(task, {
                            lowThreshold: config.lowThreshold,
                            highThreshold: config.highThreshold,
                        }),
                    );
                    console.log(`[task] humidity #${task.id} paused (no healthy sensors)`);
                }
                continue;
            }

            const avgMoisture = this.dataService.getLastAvgMoisture();

            if (task.state === 'idle') {
                // 有健康传感器 + 低于阈值 → 启动
                if (avgMoisture !== null && avgMoisture < config.lowThreshold) {
                    task.state = 'running';
                    task.startedAt = new Date();
                    task.suspendedByTaskId = null;
                    await task.save();
                    this.io.emit(
                        'task:changed',
                        toTaskDto(task, {
                            lowThreshold: config.lowThreshold,
                            highThreshold: config.highThreshold,
                        }),
                    );
                    console.log(
                        `[task] humidity #${task.id} started (moisture ${avgMoisture} < ${config.lowThreshold})`,
                    );
                }
            } else if (task.state === 'running') {
                // 高于阈值 → 完成
                if (avgMoisture !== null && avgMoisture > config.highThreshold) {
                    task.state = 'completed';
                    task.endedAt = new Date();
                    await task.save();
                    this.io.emit(
                        'task:changed',
                        toTaskDto(task, {
                            lowThreshold: config.lowThreshold,
                            highThreshold: config.highThreshold,
                        }),
                    );
                    console.log(
                        `[task] humidity #${task.id} completed (moisture ${avgMoisture} > ${config.highThreshold})`,
                    );

                    // 湿度任务完成 → 解除 timed 阻塞
                    await this.unblockTimedTasks();
                }
            } else if (task.state === 'paused') {
                // 传感器恢复 → 恢复任务
                if (avgMoisture !== null && task.suspendedByTaskId === null) {
                    task.state = 'idle';
                    await task.save();
                    this.io.emit(
                        'task:changed',
                        toTaskDto(task, {
                            lowThreshold: config.lowThreshold,
                            highThreshold: config.highThreshold,
                        }),
                    );
                }
            }
        }
    }

    /** 步骤 3: 扫描 timed 任务 */
    private async scheduleTimedTasks(): Promise<void> {
        const humidityActive = await this.isHumidityActive();
        const healthyCount = await Sensor.count({ where: { faulty: 0 } });

        const timedTasks = await IrrigationTask.findAll({
            where: {
                type: 'timed',
                state: { [Op.in]: ['idle', 'running', 'blocked'] },
            },
        });

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const currentDay = now.getDay(); // 0=周日

        // 先处理 blocked ↔ idle 切换
        for (const task of timedTasks) {
            if (humidityActive && healthyCount > 0) {
                // 应被阻塞
                if (task.state !== 'blocked') {
                    task.state = 'blocked';
                    await task.save();
                    const config = await this.loadConfig(task);
                    this.io.emit('task:changed', toTaskDto(task, config));
                }
            } else {
                // 不应被阻塞
                if (task.state === 'blocked') {
                    task.state = 'idle';
                    await task.save();
                    const config = await this.loadConfig(task);
                    this.io.emit('task:changed', toTaskDto(task, config));
                }
            }

            // 对 idle/running 任务检查时间窗口
            if (task.state === 'idle' || task.state === 'running') {
                await this.checkTimedWindow(task, currentMinutes, currentDay);
            }
        }
    }

    /** 检查单个 timed 任务的时间窗口 */
    private async checkTimedWindow(task: IrrigationTask, currentMinutes: number, currentDay: number): Promise<void> {
        const config = await TimedTaskConfig.findByPk(task.id);
        if (!config) return;

        // 解析时间段
        const startMinutes = this.parseTimeToMinutes(config.startTime);
        const endMinutes = this.parseTimeToMinutes(config.endTime);

        // 解析重复日
        const days: number[] = JSON.parse(config.daysOfWeek) as number[];
        const todayActive = days.includes(currentDay);

        // 判断是否在窗口内 (支持跨天: startMin > endMin)
        let inWindow: boolean;
        if (startMinutes <= endMinutes) {
            inWindow = todayActive && currentMinutes >= startMinutes && currentMinutes < endMinutes;
        } else {
            // 跨天: 如 22:00 ~ 02:00
            const yesterdayActive = days.includes((currentDay + 6) % 7);
            inWindow =
                (todayActive && currentMinutes >= startMinutes) || (yesterdayActive && currentMinutes < endMinutes);
        }

        if (task.state === 'idle' && inWindow) {
            task.state = 'running';
            task.startedAt = new Date();
            await task.save();
            const c = await this.loadConfig(task);
            this.io.emit('task:changed', toTaskDto(task, c));
            console.log(`[task] timed #${task.id} started (in window ${config.startTime}-${config.endTime})`);
        } else if (task.state === 'running' && !inWindow) {
            task.state = 'completed';
            task.endedAt = new Date();
            await task.save();
            const c = await this.loadConfig(task);
            this.io.emit('task:changed', toTaskDto(task, c));
            console.log(`[task] timed #${task.id} completed (outside window)`);
        }
    }

    /** 步骤 4: 应用阀门状态 */
    private async applyValve(): Promise<void> {
        const targetState = await this.computeValveTarget();

        // 获取当前阀门状态
        let currentState: number;
        try {
            currentState = await this.tcpClient.getValve();
        } catch {
            return; // ESP32 不可达则跳过
        }

        if (targetState !== currentState) {
            try {
                await this.tcpClient.setValve(targetState);
                this.io.emit('valve:changed', {
                    state: targetState,
                    triggeredBy: 'scheduler',
                });
                console.log(`[task] valve changed: ${currentState} → ${targetState}`);
            } catch (err) {
                console.error('[task] failed to set valve:', err);
            }
        }
    }

    /** 按优先级计算目标阀门状态 */
    private async computeValveTarget(): Promise<number> {
        // manual.running ?
        const manualRunning = await IrrigationTask.count({
            where: { type: 'manual', state: 'running' },
        });
        if (manualRunning > 0) return 1;

        // humidity.running ?
        const humidityRunning = await IrrigationTask.count({
            where: { type: 'humidity', state: 'running' },
        });
        if (humidityRunning > 0) return 1;

        // timed.running ?
        const timedRunning = await IrrigationTask.count({
            where: { type: 'timed', state: 'running' },
        });
        if (timedRunning > 0) return 1;

        return 0;
    }

    // ============================================================
    // 优先级抢占
    // ============================================================

    /** 暂停所有比当前任务优先级低的任务 (manual 启动时调用) */
    private async preemptLowerPriorityTasks(preemptorId: number): Promise<void> {
        const preemptor = await IrrigationTask.findByPk(preemptorId);
        if (!preemptor) return;

        const lowerTasks = await IrrigationTask.findAll({
            where: {
                id: { [Op.ne]: preemptorId },
                state: 'running',
                priority: { [Op.gt]: preemptor.priority },
            },
        });

        for (const task of lowerTasks) {
            task.state = 'paused';
            task.suspendedByTaskId = preemptorId;
            await task.save();
            const config = await this.loadConfig(task);
            this.io.emit('task:changed', toTaskDto(task, config));
        }

        if (lowerTasks.length > 0) {
            console.log(`[task] preemptor #${preemptorId}: paused ${lowerTasks.length} lower-priority tasks`);
        }
    }

    /** 恢复被指定任务抢占的任务 (manual complete/cancel 时调用) */
    private async resumePreemptedTasks(preemptorId: number): Promise<void> {
        const paused = await IrrigationTask.findAll({
            where: {
                state: 'paused',
                suspendedByTaskId: preemptorId,
            },
        });

        for (const task of paused) {
            await this.tryResume(task);
        }
    }

    /** 尝试恢复一个 paused 任务 (检查是否还有其他阻塞因素) */
    private async tryResume(task: IrrigationTask): Promise<void> {
        task.state = 'idle';
        task.suspendedByTaskId = null;
        await task.save();

        // 检查是否应被 humidity 阻塞 (timed 类型)
        if (task.type === 'timed') {
            const humidityActive = await this.isHumidityActive();
            const healthyCount = await Sensor.count({ where: { faulty: 0 } });
            if (humidityActive && healthyCount > 0) {
                task.state = 'blocked';
                await task.save();
            }
        }

        const config = await this.loadConfig(task);
        this.io.emit('task:changed', toTaskDto(task, config));
    }

    /** 解除所有 timed 任务的 blocked 状态 (humidity 完成/取消时调用) */
    private async unblockTimedTasks(): Promise<void> {
        const blocked = await IrrigationTask.findAll({
            where: { type: 'timed', state: 'blocked' },
        });

        for (const task of blocked) {
            task.state = 'idle';
            await task.save();
            const config = await this.loadConfig(task);
            this.io.emit('task:changed', toTaskDto(task, config));
        }

        if (blocked.length > 0) {
            console.log(`[task] unblocked ${blocked.length} timed tasks`);
        }
    }

    // ============================================================
    // 配置加载 / 创建 / 删除辅助
    // ============================================================

    private async loadConfig(
        task: IrrigationTask,
    ): Promise<ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto | null> {
        switch (task.type) {
            case 'manual': {
                const c = await ManualTaskConfig.findByPk(task.id);
                return c ? { durationSeconds: c.durationSeconds } : null;
            }
            case 'humidity': {
                const c = await HumidityTaskConfig.findByPk(task.id);
                return c ? { lowThreshold: c.lowThreshold, highThreshold: c.highThreshold } : null;
            }
            case 'timed': {
                const c = await TimedTaskConfig.findByPk(task.id);
                return c
                    ? {
                          startTime: c.startTime,
                          endTime: c.endTime,
                          daysOfWeek: JSON.parse(c.daysOfWeek) as number[],
                      }
                    : null;
            }
            default:
                return null;
        }
    }

    private async createConfig(
        taskId: number,
        type: TaskType,
        config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto,
    ): Promise<void> {
        switch (type) {
            case 'manual': {
                const c = config as ManualTaskConfigDto;
                await ManualTaskConfig.create({ taskId, durationSeconds: c.durationSeconds });
                break;
            }
            case 'humidity': {
                const c = config as HumidityTaskConfigDto;
                await HumidityTaskConfig.create({
                    taskId,
                    lowThreshold: c.lowThreshold,
                    highThreshold: c.highThreshold,
                });
                break;
            }
            case 'timed': {
                const c = config as TimedTaskConfigDto;
                await TimedTaskConfig.create({
                    taskId,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    daysOfWeek: JSON.stringify(c.daysOfWeek),
                });
                break;
            }
        }
    }

    private async deleteConfig(taskId: number, type: TaskType): Promise<void> {
        switch (type) {
            case 'manual':
                await ManualTaskConfig.destroy({ where: { taskId } });
                break;
            case 'humidity':
                await HumidityTaskConfig.destroy({ where: { taskId } });
                break;
            case 'timed':
                await TimedTaskConfig.destroy({ where: { taskId } });
                break;
        }
    }

    // ============================================================
    // 校验辅助
    // ============================================================

    private validateConfig(type: TaskType, config: unknown): void {
        switch (type) {
            case 'manual': {
                const c = config as ManualTaskConfigDto;
                if (!c || typeof c.durationSeconds !== 'number' || c.durationSeconds <= 0) {
                    throw new TaskError('VALIDATION_ERROR', 'manual 任务需要有效的 durationSeconds (> 0)');
                }
                break;
            }
            case 'humidity': {
                const c = config as HumidityTaskConfigDto;
                if (!c || typeof c.lowThreshold !== 'number' || typeof c.highThreshold !== 'number') {
                    throw new TaskError('VALIDATION_ERROR', 'humidity 任务需要 lowThreshold 和 highThreshold');
                }
                if (c.lowThreshold >= c.highThreshold) {
                    throw new TaskError('VALIDATION_ERROR', 'lowThreshold 必须小于 highThreshold');
                }
                break;
            }
            case 'timed': {
                const c = config as TimedTaskConfigDto;
                if (!c || !c.startTime || !c.endTime || !Array.isArray(c.daysOfWeek) || c.daysOfWeek.length === 0) {
                    throw new TaskError('VALIDATION_ERROR', 'timed 任务需要 startTime, endTime 和 daysOfWeek');
                }
                if (!/^\d{2}:\d{2}$/.test(c.startTime) || !/^\d{2}:\d{2}$/.test(c.endTime)) {
                    throw new TaskError('VALIDATION_ERROR', '时间格式必须为 HH:mm');
                }
                for (const d of c.daysOfWeek) {
                    if (d < 0 || d > 6) throw new TaskError('VALIDATION_ERROR', 'daysOfWeek 值必须在 0~6 范围内');
                }
                break;
            }
            default:
                throw new TaskError('VALIDATION_ERROR', `未知的任务类型: ${type}`);
        }
    }

    /** 校验定时任务不与已有定时任务重叠 */
    private async validateTimedNoOverlap(config: TimedTaskConfigDto): Promise<void> {
        const newStart = this.parseTimeToMinutes(config.startTime);
        const newEnd = this.parseTimeToMinutes(config.endTime);
        const newDays = new Set(config.daysOfWeek);

        const existing = await IrrigationTask.findAll({
            where: {
                type: 'timed',
                state: { [Op.notIn]: ['completed', 'cancelled'] },
            },
        });

        for (const task of existing) {
            const ec = await TimedTaskConfig.findByPk(task.id);
            if (!ec) continue;
            const eDays: number[] = JSON.parse(ec.daysOfWeek) as number[];
            const eStart = this.parseTimeToMinutes(ec.startTime);
            const eEnd = this.parseTimeToMinutes(ec.endTime);

            // 检查日期交集
            for (const d of eDays) {
                if (!newDays.has(d)) continue;
                // 同一天，检查时间段重叠
                if (this.rangesOverlap(newStart, newEnd, eStart, eEnd)) {
                    throw new TaskError(
                        'TIME_CONFLICT',
                        `与任务 #${task.id} (${ec.startTime}-${ec.endTime}) 存在时间冲突`,
                    );
                }
            }
        }
    }

    // ============================================================
    // 工具方法
    // ============================================================

    /** 检查是否有活跃的湿度任务 (非 completed/cancelled) */
    private async isHumidityActive(): Promise<boolean> {
        const count = await IrrigationTask.count({
            where: {
                type: 'humidity',
                state: { [Op.notIn]: ['completed', 'cancelled'] },
            },
        });
        return count > 0;
    }

    private getPriority(type: TaskType): 0 | 1 | 2 {
        switch (type) {
            case 'manual':
                return PRIORITY_MANUAL;
            case 'humidity':
                return PRIORITY_HUMIDITY;
            case 'timed':
                return PRIORITY_TIMED;
            default:
                return PRIORITY_TIMED; // unreachable, satisfies TypeScript
        }
    }

    private parseTimeToMinutes(time: string): number {
        const [h, m] = time.split(':').map(Number);
        return h! * 60 + m!;
    }

    private rangesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
        // 处理跨天情况使用闭合区间判断
        if (s1 <= e1 && s2 <= e2) {
            return s1 < e2 && s2 < e1;
        }
        // 至少有一个跨天
        return true; // 简化：跨天时段总是可能重叠
    }
}

// ============================================================
// 模型 → DTO
// ============================================================

function toTaskDto(
    task: IrrigationTask,
    config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto | null,
): IrrigationTaskDto {
    return {
        id: task.id,
        type: task.type as TaskType,
        state: task.state as TaskState,
        priority: task.priority as 0 | 1 | 2,
        suspendedByTaskId: task.suspendedByTaskId,
        createdAt: task.createdAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        endedAt: task.endedAt?.toISOString() ?? null,
        config,
    };
}
