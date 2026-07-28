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

    // ── 2. 创建 TCP 客户端 ──
    const tcpClient = new TcpClient(ESP_HOST, ESP_PORT);

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
    connectAndStartEsp(tcpClient, sensorService, dataService, irrigationTaskService, app.io);
}

/**
 * 连接 ESP32 并依次执行:
 *   6. 连接 ESP32 (TCP)
 *   7. 校准 ESP32 时间
 *   8. 同步传感器屏蔽位图
 *   9. 启动 30s 数据采集定时器
 *
 * 失败时通过 Socket.IO 广播 system:error 事件，前端可据此显示连接状态。
 */
async function connectAndStartEsp(
    tcpClient: TcpClient,
    sensorService: SensorService,
    dataService: DataService,
    irrigationTaskService: IrrigationTaskService,
    io: SocketIOServer,
): Promise<void> {
    try {
        console.log(`[tcp] connecting to ESP32 at ${ESP_HOST}:${ESP_PORT}...`);
        await tcpClient.connect();

        console.log('[tcp] ESP32 connected');
        io.emit('system:esp_connected', { timestamp: Date.now() });

        // 同步屏蔽位图
        await sensorService.syncMaskToEsp32();

        // 启动灌溉任务调度器 (ESP32 已就绪，串行化命令已就位)
        irrigationTaskService.startScheduler();

        // 启动 30s 数据采集定时器 (内部会先校准时间)
        dataService.start();

        // 监听 TCP 断开
        tcpClient.on('close', () => {
            console.log('[tcp] ESP32 disconnected');
            dataService.stop();
            irrigationTaskService.stopScheduler();
            io.emit('system:esp_disconnected', {
                timestamp: Date.now(),
                reason: 'connection_closed',
            });
        });

        tcpClient.on('error', (err: Error) => {
            console.error('[tcp] ESP32 socket error:', err.message);
            io.emit('system:error', {
                code: 'ESP_CONNECTION_ERROR',
                message: err.message,
            });
        });
    } catch (err) {
        console.error('[tcp] failed to connect to ESP32:', err);
        io.emit('system:esp_disconnected', {
            timestamp: Date.now(),
            reason: String(err),
        });
        io.emit('system:error', {
            code: 'ESP_NOT_CONNECTED',
            message: '无法连接到 ESP32 设备，数据采集未启动',
        });
    }
}

main().catch((err) => {
    console.error('[fatal] startup failed:', err);
    process.exit(1);
});
