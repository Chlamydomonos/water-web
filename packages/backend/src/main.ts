import Fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { db } from './db/index.js';
import { TcpClient } from './tcp/tcp-client.js';
import { SensorService } from './services/sensor.service.js';
import { DelayQueue } from './services/delay-queue.js';
import { DataService } from './services/data.service.js';
import { CleanupService } from './services/cleanup.service.js';
import { IrrigationTaskService } from './services/irrigation-task.service.js';
import { registerSensorRoutes } from './routes/sensor.routes.js';
import { registerTaskRoutes } from './routes/task.routes.js';
import { registerSystemRoutes } from './routes/system.routes.js';
import { registerDataRoutes } from './routes/data.routes.js';

// ESP32 设备连接配置 (可通过环境变量覆盖)
const ESP_HOST = process.env.ESP_HOST ?? '192.168.0.121';
const ESP_PORT = Number(process.env.ESP_PORT ?? 8888);

async function main() {
    // ── 1. 初始化数据库 ──
    await db.authenticate();
    await db.sync();
    console.log('[db] SQLite connected & models synced');

    // ── 2. 创建 TCP 客户端 (启用断线自动重连) ──
    const tcpClient = new TcpClient(ESP_HOST, ESP_PORT, {
        autoReconnect: true,
        reconnectInterval: 3000, // 初始 3s
        reconnectMaxInterval: 30000, // 上限 30s
        reconnectMaxAttempts: 0, // 无限重试
    });

    // ── 3. 创建 Fastify + Socket.IO ──
    const app = Fastify({ logger: true });
    await app.register(fastifySocketIO.default);

    // ── 健康检查端点（允许跨域，用于外部探活） ──
    app.get('/api/health', async (_req, reply) => {
        reply.header('Access-Control-Allow-Origin', '*');
        return { status: 'ok', timestamp: Date.now() };
    });

    // ── 4. 创建服务实例 ──
    const sensorService = new SensorService(tcpClient, app.io);

    // 创建延迟推送队列 (依赖 Socket.IO)
    const delayQueue = new DelayQueue(app.io);

    // 创建数据采集服务 (依赖 TcpClient + DelayQueue)
    const dataService = new DataService(tcpClient, delayQueue);

    // 创建数据清理服务
    const cleanupService = new CleanupService();

    // 创建灌溉任务服务 (依赖 TcpClient + DataService + Socket.IO)
    const irrigationTaskService = new IrrigationTaskService(tcpClient, dataService, app.io);

    // 注册路由
    registerSensorRoutes(app, sensorService);
    registerTaskRoutes(app, irrigationTaskService);
    registerSystemRoutes(app, { tcpClient, dataService, taskService: irrigationTaskService });
    registerDataRoutes(app, dataService);

    // Socket.IO 事件绑定
    app.io.on('connection', (socket) => {
        console.log('[socket] client connected:', socket.id);
        socket.on('disconnect', () => {
            console.log('[socket] client disconnected:', socket.id);
        });
    });

    // ── 启动延迟推送定时器 (先于数据采集，确保新连接能收到已有数据) ──
    delayQueue.start();

    // ── 校准生命周期回调: 校准开始时暂停所有任务，校准结束恢复 ──
    sensorService.setCalibrationChangeHandler(async (calibrating: boolean) => {
        if (calibrating) {
            await irrigationTaskService.onCalibrationStart();
        } else {
            await irrigationTaskService.onCalibrationStop();
        }
    });

    // ── 10. 启动数据清理定时器 ──
    cleanupService.start();

    // ── 11. 启动 HTTP 服务 (不阻塞 ESP32 连接) ──
    const port = 3000;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[http] server listening on http://localhost:${port}`);

    // ── 6-9. 连接 ESP32 并启动采集 (异步，不阻塞 HTTP) ──
    bindEspLifecycle(tcpClient, sensorService, dataService, irrigationTaskService, app.io);
}

/**
 * 绑定 ESP32 生命周期事件并发起首次连接。
 *
 * - 'connected'    : ESP32 上线 (首次或重连) → 同步屏蔽位图、启动调度器与采集
 * - 'disconnected' : ESP32 下线 → 停止采集与调度器, 广播断开事件
 * - 'reconnecting' : 即将重连 → 广播重连中事件
 * - 'error'        : 底层错误 → 广播错误事件
 */
function bindEspLifecycle(
    tcpClient: TcpClient,
    sensorService: SensorService,
    dataService: DataService,
    irrigationTaskService: IrrigationTaskService,
    io: SocketIOServer,
): void {
    tcpClient.on('connected', () => {
        io.emit('system:esp_connected', { timestamp: Date.now() });

        // 同步屏蔽位图 (不阻塞启动流程, 失败仅记录)
        sensorService.syncMaskToEsp32().catch((err) => console.error('[sensor] syncMaskToEsp32 failed:', err));

        // 启动灌溉任务调度器 (串行化命令已就位)
        irrigationTaskService.startScheduler();

        // 启动 30s 数据采集定时器 (内部会先校准时间)
        dataService.start();
    });

    tcpClient.on('disconnected', () => {
        dataService.stop();
        irrigationTaskService.stopScheduler();
        io.emit('system:esp_disconnected', {
            timestamp: Date.now(),
            reason: 'connection_closed',
        });
    });

    tcpClient.on('reconnecting', (info: { attempt: number; delayMs: number }) => {
        io.emit('system:error', {
            code: 'ESP_RECONNECTING',
            message: `ESP32 连接断开, 将在 ${Math.ceil(info.delayMs / 1000)}s 后重试 (第 ${info.attempt} 次)`,
        });
    });

    tcpClient.on('error', (err: Error) => {
        console.error('[tcp] ESP32 socket error:', err.message);
        io.emit('system:error', {
            code: 'ESP_CONNECTION_ERROR',
            message: err.message,
        });
    });

    // 发起首次连接 (失败后会自动进入重连循环)
    console.log(`[tcp] connecting to ESP32 at ${ESP_HOST}:${ESP_PORT}...`);
    void tcpClient.connectAuto().catch((err: unknown) => {
        // connectAuto 内部已处理重连调度, 这里仅拦截未预期错误
        console.error('[tcp] connectAuto 未预期错误:', err);
        io.emit('system:error', {
            code: 'ESP_NOT_CONNECTED',
            message: '无法连接到 ESP32 设备, 进入自动重连',
        });
    });
}

main().catch((err) => {
    console.error('[fatal] startup failed:', err);
    process.exit(1);
});
