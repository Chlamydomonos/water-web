/**
 * 系统状态 REST 路由
 *
 * 参考: docs/api-design.md §5 系统 API
 */

import type { FastifyInstance } from 'fastify';
import type { TcpClient } from '../tcp/tcp-client.js';
import type { DataService } from '../services/data.service.js';
import type { IrrigationTaskService } from '../services/irrigation-task.service.js';
import { isCalibrating } from '../services/sensor.service.js';
import { Sensor } from '../db/models/Sensor.js';
import { IrrigationTask } from '../db/models/IrrigationTask.js';
import { ok, fail, internalError } from '../lib/response.js';
import type { SystemStatus } from 'shared';

export interface SystemRoutesDeps {
    tcpClient: TcpClient;
    dataService: DataService;
    taskService: IrrigationTaskService;
}

export function registerSystemRoutes(app: FastifyInstance, deps: SystemRoutesDeps): void {
    const { tcpClient, dataService, taskService } = deps;

    // ── 系统综合状态 ──
    app.post('/api/system/status', async (_req, reply) => {
        try {
            const [healthyCount, calibratedCount, activeTaskCount, activeTask, valveState] = await Promise.all([
                Sensor.count({ where: { faulty: 0 } }),
                Sensor.count({ where: { calibrated: 1 } }),
                IrrigationTask.count({ where: { state: 'running' } }),
                IrrigationTask.findOne({
                    where: { state: 'running' },
                    order: [['priority', 'ASC']],
                }),
                tcpClient.getValve().catch(() => 0 as const),
            ]);

            const activeTaskDto = activeTask ? await taskService.detail(activeTask.id) : null;

            const status: SystemStatus = {
                espConnected: tcpClient.connected,
                valveState: valveState as 0 | 1,
                activeTaskCount,
                activeTask: activeTaskDto,
                healthySensorCount: healthyCount,
                calibratedSensorCount: calibratedCount,
                calibrationInProgress: isCalibrating(),
                lastCollectionTime: dataService.getLastCollectionTime(),
            };

            return reply.send(ok(status));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 阀门状态 ──
    app.post('/api/system/valve/status', async (_req, reply) => {
        try {
            let state: 0 | 1 = 0;
            try {
                state = (await tcpClient.getValve()) as 0 | 1;
            } catch {
                return reply.send(fail('ESP_NOT_CONNECTED', 'ESP32 未连接'));
            }
            return reply.send(ok({ state }));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });
}
