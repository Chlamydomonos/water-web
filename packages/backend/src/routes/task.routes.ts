/**
 * 灌溉任务 REST 路由
 *
 * 参考: docs/backend-design.md §5.6 灌溉任务相关 REST API
 */

import type { FastifyInstance } from 'fastify';
import type { IrrigationTaskService } from '../services/irrigation-task.service.js';
import { TaskError } from '../services/irrigation-task.service.js';
import { ok, fail, internalError } from '../lib/response.js';
import type { TaskCreateRequest, TaskUpdateRequest, TaskActionRequest, TaskListRequest } from 'shared';

export function registerTaskRoutes(app: FastifyInstance, taskService: IrrigationTaskService): void {
    // ── 列表 ──
    app.post('/api/tasks/list', async (req, reply) => {
        try {
            const { type, state } = (req.body || {}) as TaskListRequest;
            const tasks = await taskService.list(type, state);
            return reply.send(ok(tasks));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 详情 ──
    app.post('/api/tasks/detail', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.detail(id);
            if (!task) {
                return reply.send(fail('TASK_NOT_FOUND', '灌溉任务不存在'));
            }
            return reply.send(ok(task));
        } catch (err) {
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 创建 ──
    app.post('/api/tasks/create', async (req, reply) => {
        try {
            const body = req.body as TaskCreateRequest;
            const task = await taskService.create(body);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 更新 ──
    app.post('/api/tasks/update', async (req, reply) => {
        try {
            const { id, config } = req.body as TaskUpdateRequest;
            const task = await taskService.update(id, config);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 删除 ──
    app.post('/api/tasks/delete', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            await taskService.delete(id);
            return reply.send(ok({ deleted: true }));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 手动启动 ──
    app.post('/api/tasks/start', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.start(id);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 暂停 ──
    app.post('/api/tasks/pause', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.pause(id);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 恢复 ──
    app.post('/api/tasks/resume', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.resume(id);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 取消 ──
    app.post('/api/tasks/cancel', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.cancel(id);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });

    // ── 手动结束 ──
    app.post('/api/tasks/stop', async (req, reply) => {
        try {
            const { id } = req.body as TaskActionRequest;
            const task = await taskService.stop(id);
            return reply.send(ok(task));
        } catch (err) {
            if (err instanceof TaskError) {
                return reply.send(fail(err.code, err.message));
            }
            return reply.status(500).send(internalError(String(err)));
        }
    });
}
