import type { TcpClient } from '../tcp/tcp-client.js';
import type { Server as SocketIOServer } from 'socket.io';
import { Sensor } from '../db/models/Sensor.js';
import { CalibrationPoint } from '../db/models/CalibrationPoint.js';
import { RawSensorReading } from '../db/models/RawSensorReading.js';
import type {
    SensorDto,
    CalibrationPointDto,
    CalibrationStatusResponse,
    CalibrationCalculateResponse,
    CalibrationFormula,
} from 'shared';

// ============================================================
// 校准状态管理（内存中，单传感器校准）
// ============================================================

let calibratingSensorId: number | null = null;

/** 导出校准状态 (供 IrrigationTaskService 等外部使用) */
export function isCalibrating(): boolean {
    return calibratingSensorId !== null;
}

export function getCalibratingSensorId(): number | null {
    return calibratingSensorId;
}

// ============================================================
// 模型 → DTO
// ============================================================

function toSensorDto(s: Sensor): SensorDto {
    return {
        id: s.id,
        slaveAddr: s.slaveAddr,
        name: s.name,
        faulty: s.faulty === 1,
        calibrated: s.calibrated === 1,
        calibSlope: s.calibSlope ?? null,
        calibIntercept: s.calibIntercept ?? null,
        createdAt: s.createdAt.toISOString(),
    };
}

function toCalibPointDto(cp: CalibrationPoint): CalibrationPointDto {
    return {
        id: cp.id,
        sensorId: cp.sensorId,
        pulseCount: cp.pulseCount,
        actualMoisture: cp.actualMoisture,
        createdAt: cp.createdAt.toISOString(),
    };
}

// ============================================================
// SensorService
// ============================================================

export class SensorService {
    private onCalibrationChange?: (calibrating: boolean) => void | Promise<void>;

    constructor(
        private readonly tcpClient: TcpClient,
        private readonly io?: SocketIOServer,
    ) {}

    /** 注册校准状态变更回调 (供 IrrigationTaskService 集成) */
    setCalibrationChangeHandler(handler: (calibrating: boolean) => void | Promise<void>): void {
        this.onCalibrationChange = handler;
    }

    // ── 传感器 CRUD ──

    async list(): Promise<SensorDto[]> {
        const sensors = await Sensor.findAll({ order: [['id', 'ASC']] });
        return sensors.map(toSensorDto);
    }

    async detail(id: number): Promise<SensorDto | null> {
        const sensor = await Sensor.findByPk(id);
        return sensor ? toSensorDto(sensor) : null;
    }

    async create(slaveAddr: number, name: string): Promise<SensorDto> {
        const sensor = await Sensor.create({ slaveAddr, name });
        await this.syncMaskToEsp32();
        const dto = toSensorDto(sensor);
        this.io?.emit('sensor:changed', dto);
        return dto;
    }

    async update(id: number, fields: { name?: string; faulty?: boolean }): Promise<SensorDto | null> {
        const sensor = await Sensor.findByPk(id);
        if (!sensor) return null;

        const prevFaulty = sensor.faulty;
        if (fields.name !== undefined) sensor.name = fields.name;
        if (fields.faulty !== undefined) sensor.faulty = fields.faulty ? 1 : 0;
        await sensor.save();

        // faulty 变更时重新同步屏蔽位图
        if (fields.faulty !== undefined && (fields.faulty ? 1 : 0) !== prevFaulty) {
            await this.syncMaskToEsp32();
        }

        const dto = toSensorDto(sensor);
        this.io?.emit('sensor:changed', dto);
        return dto;
    }

    async delete(id: number): Promise<boolean> {
        const sensor = await Sensor.findByPk(id);
        if (!sensor) return false;
        const dto = toSensorDto(sensor);
        await sensor.destroy();
        await this.syncMaskToEsp32();
        this.io?.emit('sensor:changed', dto);
        return true;
    }

    // ── 屏蔽位图同步 ──

    async syncMaskToEsp32(): Promise<void> {
        const sensors = await Sensor.findAll();
        const activeAddresses = new Set(sensors.filter((s) => s.faulty === 0).map((s) => s.slaveAddr));

        for (let addr = 0; addr <= 15; addr++) {
            const shouldMask = !activeAddresses.has(addr);
            await this.tcpClient.maskSlave(addr, shouldMask);
        }
    }

    // ── 校准 ──

    async calibrationStart(sensorId: number): Promise<{ status: string }> {
        if (calibratingSensorId !== null) {
            throw new CalibrationError('CALIBRATION_IN_PROGRESS', '已有传感器在校准中');
        }
        const sensor = await Sensor.findByPk(sensorId);
        if (!sensor) {
            throw new CalibrationError('SENSOR_NOT_FOUND', '传感器不存在');
        }
        if (calibratingSensorId === sensorId) {
            throw new CalibrationError('SENSOR_ALREADY_CALIBRATING', '该传感器已在校准中');
        }
        calibratingSensorId = sensorId;
        // 通知灌溉任务服务暂停所有任务
        await this.onCalibrationChange?.(true);
        this.io?.emit('calibration:started', { sensorId });
        return { status: 'calibrating' };
    }

    async calibrationStop(sensorId: number): Promise<{ status: string }> {
        if (calibratingSensorId !== sensorId) {
            throw new CalibrationError('NOT_CALIBRATING', '该传感器未处于校准模式');
        }
        calibratingSensorId = null;
        // 通知灌溉任务服务恢复任务
        await this.onCalibrationChange?.(false);
        this.io?.emit('calibration:stopped', { sensorId });
        return { status: 'idle' };
    }

    async calibrationSubmitData(sensorId: number, actualMoisture: number): Promise<CalibrationPointDto> {
        if (calibratingSensorId !== sensorId) {
            throw new CalibrationError('NOT_CALIBRATING', '该传感器未处于校准模式');
        }
        const sensor = await Sensor.findByPk(sensorId);
        if (!sensor) {
            throw new CalibrationError('SENSOR_NOT_FOUND', '传感器不存在');
        }

        // 读取该传感器最近一次采集的脉冲计数
        const latestReading = await RawSensorReading.findOne({
            where: { sensorId },
            order: [['id', 'DESC']],
        });
        if (!latestReading) {
            throw new CalibrationError('NO_PULSE_DATA', '暂无该传感器的采集数据');
        }

        const point = await CalibrationPoint.create({
            sensorId,
            pulseCount: latestReading.pulseCount,
            actualMoisture,
        });

        return toCalibPointDto(point);
    }

    async calibrationCalculate(sensorId: number): Promise<CalibrationCalculateResponse> {
        if (calibratingSensorId !== sensorId) {
            throw new CalibrationError('NOT_CALIBRATING', '该传感器未处于校准模式');
        }
        const sensor = await Sensor.findByPk(sensorId);
        if (!sensor) {
            throw new CalibrationError('SENSOR_NOT_FOUND', '传感器不存在');
        }

        const points = await CalibrationPoint.findAll({
            where: { sensorId },
            order: [['createdAt', 'ASC']],
        });
        if (points.length < 2) {
            throw new CalibrationError('INSUFFICIENT_CALIB_DATA', '至少需要 2 个校准数据点');
        }

        // 最小二乘线性回归
        const n = points.length;
        const xs = points.map((p) => p.pulseCount);
        const ys = points.map((p) => p.actualMoisture);
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i]!, 0);
        const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // R²
        const meanY = sumY / n;
        const ssRes = ys.reduce((sum, y, i) => {
            const predicted = slope * xs[i]! + intercept;
            return sum + (y - predicted) ** 2;
        }, 0);
        const ssTot = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
        const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

        // 写入传感器校准参数
        sensor.calibSlope = slope;
        sensor.calibIntercept = intercept;
        sensor.calibrated = 1;
        await sensor.save();

        // 推送传感器变更事件
        this.io?.emit('sensor:changed', toSensorDto(sensor));

        return { slope, intercept, rSquared, pointCount: n };
    }

    async calibrationStatus(sensorId: number): Promise<CalibrationStatusResponse> {
        const sensor = await Sensor.findByPk(sensorId);
        if (!sensor) {
            throw new CalibrationError('SENSOR_NOT_FOUND', '传感器不存在');
        }

        const points = await CalibrationPoint.findAll({
            where: { sensorId },
            order: [['createdAt', 'ASC']],
        });

        const formula: CalibrationFormula | null =
            sensor.calibrated === 1 && sensor.calibSlope != null && sensor.calibIntercept != null
                ? { slope: sensor.calibSlope, intercept: sensor.calibIntercept }
                : null;

        return {
            sensorId,
            calibrating: calibratingSensorId === sensorId,
            calibrated: sensor.calibrated === 1,
            formula,
            points: points.map(toCalibPointDto),
        };
    }
}

// ============================================================
// 校准业务错误
// ============================================================

export class CalibrationError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'CalibrationError';
    }
}
