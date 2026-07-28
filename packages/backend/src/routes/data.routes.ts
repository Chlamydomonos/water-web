/**
 * 历史数据 REST 路由
 *
 * 参考: docs/api-design.md §6 历史数据 API
 */

import type { FastifyInstance } from 'fastify';
import type { DataService } from '../services/data.service.js';
import { ok, fail, internalError } from '../lib/response.js';
import type { HistoryRequest, LatestDataRequest } from 'shared';

export function registerDataRoutes(app: FastifyInstance, dataService: DataService): void {
    // ── 查询历史数据 ──
    app.post('/api/data/history', async (req, reply) => {
        try {
            const { from, to, resolution } = req.body as HistoryRequest;

            const fromDate = new Date(from);
            const toDate = new Date(to);

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                return reply.send(fail('VALIDATION_ERROR', 'from/to 必须是有效的 ISO 8601 时间字符串'));
            }

            if (fromDate >= toDate) {
                return reply.send(fail('VALIDATION_ERROR', 'from 必须早于 to'));
            }

            // 限制不超过 30 天前
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
            if (fromDate < cutoff) {
                return reply.send(fail('DATA_OUT_OF_RANGE', '查询范围不能超过 30 天前（数据已过期删除）'));
            }

            if (resolution && !['raw', 'second', 'hour'].includes(resolution)) {
                return reply.send(fail('VALIDATION_ERROR', 'resolution 必须是 raw / second / hour'));
            }

            const points = await dataService.queryHistory(
                fromDate,
                toDate,
                resolution as 'raw' | 'second' | 'hour' | undefined,
            );

            return reply.send(ok(points));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 获取最近数据（前端重连补全） ──
    app.post('/api/data/latest', async (req, reply) => {
        try {
            const { minutes } = (req.body || {}) as LatestDataRequest;
            const mins = minutes ?? 5;

            if (typeof mins !== 'number' || mins <= 0 || mins > 60) {
                return reply.send(fail('VALIDATION_ERROR', 'minutes 必须在 1~60 范围内'));
            }

            const readings = await dataService.getLatestReadings(mins);

            return reply.send(ok({ readings }));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });
}
