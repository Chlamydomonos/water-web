import type { FastifyInstance } from 'fastify';
import type { SensorService } from '../services/sensor.service.js';
import { CalibrationError } from '../services/sensor.service.js';
import { ok, fail, internalError } from '../lib/response.js';
import type {
    SensorCreateRequest,
    SensorUpdateRequest,
    SensorDetailRequest,
    SensorDeleteRequest,
    CalibrationStartRequest,
    CalibrationStopRequest,
    CalibrationSubmitDataRequest,
    CalibrationCalculateRequest,
    CalibrationStatusRequest,
} from 'shared';

// ============================================================
// 传感器路由注册
// ============================================================

export function registerSensorRoutes(app: FastifyInstance, sensorService: SensorService): void {
    // ── 传感器 CRUD ──

    app.post('/api/sensors/list', async (_req, reply) => {
        try {
            const sensors = await sensorService.list();
            return reply.send(ok(sensors));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/detail', async (req, reply) => {
        try {
            const { id } = req.body as SensorDetailRequest;
            const sensor = await sensorService.detail(id);
            if (!sensor) {
                return reply.send(fail('SENSOR_NOT_FOUND', '传感器不存在'));
            }
            return reply.send(ok(sensor));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/create', async (req, reply) => {
        try {
            const { slaveAddr, name } = req.body as SensorCreateRequest;
            if (slaveAddr < 0 || slaveAddr > 15) {
                return reply.send(fail('SLAVE_ADDR_INVALID', '从机地址必须在 0~15 范围内'));
            }
            if (!name || !name.trim()) {
                return reply.send(fail('VALIDATION_ERROR', '传感器名称不能为空'));
            }
            const sensor = await sensorService.create(slaveAddr, name.trim());
            return reply.send(ok(sensor));
        } catch (err: unknown) {
            // slaveAddr 唯一约束冲突
            if (err instanceof Error && err.name === 'SequelizeUniqueConstraintError') {
                return reply.send(fail('SLAVE_ADDR_TAKEN', '该从机地址已被占用'));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/update', async (req, reply) => {
        try {
            const { id, name, faulty } = req.body as SensorUpdateRequest;
            const sensor = await sensorService.update(id, { name, faulty });
            if (!sensor) {
                return reply.send(fail('SENSOR_NOT_FOUND', '传感器不存在'));
            }
            return reply.send(ok(sensor));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/delete', async (req, reply) => {
        try {
            const { id } = req.body as SensorDeleteRequest;
            const deleted = await sensorService.delete(id);
            if (!deleted) {
                return reply.send(fail('SENSOR_NOT_FOUND', '传感器不存在'));
            }
            return reply.send(ok({ deleted: true }));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 校准 ──

    app.post('/api/sensors/calibration/start', async (req, reply) => {
        try {
            const { sensorId } = req.body as CalibrationStartRequest;
            const result = await sensorService.calibrationStart(sensorId);
            return reply.send(ok(result));
        } catch (err) {
            if (err instanceof CalibrationError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/calibration/stop', async (req, reply) => {
        try {
            const { sensorId } = req.body as CalibrationStopRequest;
            const result = await sensorService.calibrationStop(sensorId);
            return reply.send(ok(result));
        } catch (err) {
            if (err instanceof CalibrationError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/calibration/submit-data', async (req, reply) => {
        try {
            const { sensorId, actualMoisture } = req.body as CalibrationSubmitDataRequest;
            const point = await sensorService.calibrationSubmitData(sensorId, actualMoisture);
            return reply.send(ok(point));
        } catch (err) {
            if (err instanceof CalibrationError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/calibration/calculate', async (req, reply) => {
        try {
            const { sensorId } = req.body as CalibrationCalculateRequest;
            const result = await sensorService.calibrationCalculate(sensorId);
            return reply.send(ok(result));
        } catch (err) {
            if (err instanceof CalibrationError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    app.post('/api/sensors/calibration/status', async (req, reply) => {
        try {
            const { sensorId } = req.body as CalibrationStatusRequest;
            const result = await sensorService.calibrationStatus(sensorId);
            return reply.send(ok(result));
        } catch (err) {
            if (err instanceof CalibrationError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });
}
