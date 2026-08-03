/**
 * DataService — 数据采集与持久化服务
 *
 * 负责 30 秒定时采集循环：时间校准 → 拉取缓冲区 → 过滤/转换/存储 → 入队延迟推送。
 *
 * 参考: docs/backend-design.md §3 数据采集与持久化
 */

import type { TcpClient } from '../tcp/tcp-client.js';
import type { BufferEntry } from '../tcp/types.js';
import { RawReading } from '../db/models/RawReading.js';
import { RawSensorReading } from '../db/models/RawSensorReading.js';
import { AggregatedData } from '../db/models/AggregatedData.js';
import { Sensor } from '../db/models/Sensor.js';
import { DelayQueue } from './delay-queue.js';
import { Op } from '@sequelize/core';
import type { DataSnapshot, SensorSnapshot, DataPoint, RawReadingDetail } from 'shared';

/** 采集间隔 (毫秒) */
const COLLECTION_INTERVAL_MS = 30_000;

export class DataService {
    /** 采集定时器 */
    private timer: ReturnType<typeof setInterval> | null = null;

    /** ESP32 时间偏移量 (localNow - espTimestamp)，每次采集时重新计算 */
    private timeOffset = 0;

    /** 最近一次采集的平均含水量 (供灌溉调度器使用) */
    private latestAvgMoisture: number | null = null;

    /** 最近一次阀门状态 */
    private latestValveState: 0 | 1 = 0;

    /** 最近一次成功采集的 ISO 时间 */
    private lastCollectionTime: string | null = null;

    constructor(
        private readonly tcpClient: TcpClient,
        private readonly delayQueue: DelayQueue,
    ) {}

    /** 获取最近一次采集的平均含水量 */
    getLastAvgMoisture(): number | null {
        return this.latestAvgMoisture;
    }

    /** 获取最近一次成功采集时间 */
    getLastCollectionTime(): string | null {
        return this.lastCollectionTime;
    }

    // ============================================================
    // 生命周期
    // ============================================================

    /** 启动 30 秒采集定时器 */
    start(): void {
        if (this.timer) return;
        console.log('[data] starting 30s collection loop');
        // 立即执行第一次采集
        this.collect();
        this.timer = setInterval(() => {
            this.collect();
        }, COLLECTION_INTERVAL_MS);
    }

    /** 停止采集定时器 */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[data] collection loop stopped');
        }
    }

    // ============================================================
    // 采集循环
    // ============================================================

    /**
     * 单次采集流程:
     *   1. 时间校准 (GET_TIME → 计算 offset)
     *   2. 拉取缓冲区 (GET_BUFFER)
     *   3. 过滤 + 转换 + 校正时间戳
     *   4. 持久化 RawReading + RawSensorReading
     *   5. 入队延迟推送
     *   6. 清空 ESP32 缓冲区 (CLEAR_BUFFER)
     */
    private collect = async (): Promise<void> => {
        try {
            // ── 1. 时间校准 ──
            await this.calibrateTime();

            // ── 2. 拉取缓冲区 ──
            const { entries } = await this.tcpClient.getBuffer();
            if (entries.length === 0) return;

            // ── 3. 读取传感器映射 (slaveAddr → Sensor) ──
            const sensorMap = await this.buildSensorMap();

            // ── 4. 逐条处理 ──
            for (const entry of entries) {
                await this.processEntry(entry, sensorMap);
            }

            // ── 5. 清空 ESP32 缓冲区 ──
            const cleared = await this.tcpClient.clearBuffer();
            if (cleared > 0) {
                console.log(`[data] cleared ${cleared} buffer entries`);
            }

            // ── 6. 更新最后采集时间 ──
            this.lastCollectionTime = new Date().toISOString();
        } catch (err) {
            console.error('[data] collection error:', err);
        }
    };

    // ============================================================
    // 时间校准
    // ============================================================

    /**
     * 获取 ESP32 时间戳并计算偏移量
     * offset = Date.now() - espTimestamp
     */
    private calibrateTime = async (): Promise<void> => {
        const espTime = await this.tcpClient.getTime();
        this.timeOffset = Date.now() - espTime;
    };

    // ============================================================
    // 传感器映射
    // ============================================================

    /**
     * 构建 slaveAddr → Sensor 映射表
     * 仅包含健康 (非故障) 的传感器
     */
    private async buildSensorMap(): Promise<Map<number, Sensor>> {
        const sensors = await Sensor.findAll({ where: { faulty: 0 } });
        const map = new Map<number, Sensor>();
        for (const s of sensors) {
            map.set(s.slaveAddr, s);
        }
        return map;
    }

    // ============================================================
    // 条目处理
    // ============================================================

    /**
     * 处理单个 BufferEntry:
     *   - 过滤: 仅保留已添加且健康的传感器
     *   - 转换: 已校准传感器 pulse → moisture
     *   - 校正: entry.timestampMs + timeOffset
     *   - 持久化: RawReading + RawSensorReading
     *   - 入队: DataSnapshot → DelayQueue
     */
    private async processEntry(entry: BufferEntry, sensorMap: Map<number, Sensor>): Promise<void> {
        const correctedTs = entry.timestampMs + this.timeOffset;
        const timestamp = new Date(correctedTs);

        // 构建传感器快照列表
        const sensorSnapshots: SensorSnapshot[] = [];
        const moistureValues: number[] = [];

        for (let slaveAddr = 0; slaveAddr < entry.slaves.length; slaveAddr++) {
            const sensor = sensorMap.get(slaveAddr);
            if (!sensor) continue; // 未添加或故障的传感器不处理

            const slaveData = entry.slaves[slaveAddr]!;
            const pulseCount = slaveData.pulseCount;

            // CRC-8 简单校验: 非零即为有效 (ESP32 端计算)
            const crc8Valid = slaveData.crc8 !== 0;

            // 已校准传感器进行脉冲→含水量转换: y = a * ln(1000/x) + b
            let moisture: number | null = null;
            if (sensor.calibrated === 1 && sensor.calibA != null && sensor.calibB != null) {
                if (pulseCount > 0 && pulseCount < 1500) {
                    moisture = sensor.calibA * Math.log(1000 / pulseCount) + sensor.calibB;
                    if (crc8Valid) {
                        moistureValues.push(moisture);
                    }
                }
            }

            sensorSnapshots.push({
                sensorId: sensor.id,
                name: sensor.name,
                slaveAddr,
                pulseCount,
                moisture,
                crc8Valid,
            });
        }

        // 如果没有活跃传感器数据，跳过本条
        if (sensorSnapshots.length === 0) return;

        // 计算平均含水量 (仅包含已校准且 CRC 有效的传感器)
        const avgMoisture =
            moistureValues.length > 0 ? moistureValues.reduce((a, b) => a + b, 0) / moistureValues.length : null;

        // 更新缓存 (供灌溉调度器使用)
        this.latestAvgMoisture = avgMoisture;

        // 获取当前阀门状态
        let valveState: 0 | 1 = 0;
        try {
            valveState = (await this.tcpClient.getValve()) as 0 | 1;
        } catch {
            // 获取阀门状态失败不影响采集
        }
        this.latestValveState = valveState;

        // ── 持久化 ──
        const reading = await RawReading.create({
            timestamp,
            avgMoisture,
            valveState,
        });

        await RawSensorReading.bulkCreate(
            sensorSnapshots.map((s) => ({
                readingId: reading.id,
                sensorId: s.sensorId,
                slaveAddr: s.slaveAddr,
                pulseCount: s.pulseCount,
                moisture: s.moisture,
                crc8Valid: s.crc8Valid ? (1 as const) : (0 as const),
            })),
        );

        // ── 入队延迟推送 ──
        this.delayQueue.enqueue({
            timestamp: correctedTs,
            avgMoisture,
            valveState,
            sensors: sensorSnapshots,
        });
    }

    // ============================================================
    // 历史数据查询 (供 REST API 使用)
    // ============================================================

    /**
     * 查询历史数据点
     * 根据时间范围自动选择数据源: raw → second → hour
     */
    async queryHistory(from: Date, to: Date, resolution?: 'raw' | 'second' | 'hour'): Promise<DataPoint[]> {
        const rangeMs = to.getTime() - from.getTime();
        const rangeDays = rangeMs / (24 * 60 * 60_000);

        // 自动选择分辨率
        const resolved: 'raw' | 'second' | 'hour' =
            resolution ?? (rangeDays <= 1 ? 'raw' : rangeDays <= 7 ? 'second' : 'hour');

        if (resolved === 'raw') {
            const readings = await RawReading.findAll({
                where: {
                    timestamp: { [Op.gte]: from, [Op.lt]: to },
                },
                order: [['timestamp', 'ASC']],
            });

            return readings.map((r) => ({
                timestamp: r.timestamp.toISOString(),
                avgMoisture: r.avgMoisture,
                valveState: r.valveState,
            }));
        }

        const records = await AggregatedData.findAll({
            where: {
                resolution: resolved,
                timestamp: { [Op.gte]: from, [Op.lt]: to },
            },
            order: [['timestamp', 'ASC']],
        });

        return records.map((r) => ({
            timestamp: r.timestamp.toISOString(),
            avgMoisture: r.avgMoisture,
        }));
    }

    /**
     * 获取最近 N 分钟的原始数据详情（含传感器明细）
     * 供前端重连时补全图表数据
     */
    async getLatestReadings(minutes: number = 5): Promise<RawReadingDetail[]> {
        const since = new Date(Date.now() - minutes * 60_000);

        const readings = await RawReading.findAll({
            where: {
                timestamp: { [Op.gte]: since },
            },
            order: [['timestamp', 'ASC']],
        });

        const results: RawReadingDetail[] = [];

        for (const reading of readings) {
            const sensorReadings = await RawSensorReading.findAll({
                where: { readingId: reading.id },
            });

            // 加载传感器名称
            const sensorIds = [...new Set(sensorReadings.map((sr) => sr.sensorId))];
            const sensors = await Sensor.findAll({ where: { id: { [Op.in]: sensorIds } } });
            const sensorMap = new Map(sensors.map((s) => [s.id, s]));

            const sensorSnapshots: SensorSnapshot[] = sensorReadings.map((sr) => {
                const sensor = sensorMap.get(sr.sensorId);
                return {
                    sensorId: sr.sensorId,
                    name: sensor?.name ?? `Sensor #${sr.sensorId}`,
                    slaveAddr: sr.slaveAddr,
                    pulseCount: sr.pulseCount,
                    moisture: sr.moisture,
                    crc8Valid: sr.crc8Valid === 1,
                };
            });

            results.push({
                timestamp: reading.timestamp.toISOString(),
                avgMoisture: reading.avgMoisture,
                valveState: reading.valveState,
                sensors: sensorSnapshots,
            });
        }

        return results;
    }
}
