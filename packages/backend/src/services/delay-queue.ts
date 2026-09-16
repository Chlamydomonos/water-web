/**
 * DelayQueue — 实时推送队列
 *
 * 采集到的 DataSnapshot 立即推送给前端 (无延迟)。
 * 60 秒延迟显示与每秒平滑释放的逻辑由前端实现 (见 frontend data store)。
 *
 * 设计要点:
 *   - 采集后立即 emit，前端负责延迟显示
 *   - 新连接时立即推送所有队列中的数据 (最多 5 分钟)
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { DataSnapshot } from 'shared';

/** 队列条目 */
interface QueueEntry {
    snapshot: DataSnapshot;
    releaseTime: number; // Date.now() 毫秒值
}

export class DelayQueue {
    /** 推送事件名 */
    private static readonly EVENT = 'data:new';

    /** 最大保留时长 (毫秒) */
    private static readonly MAX_RETENTION_MS = 5 * 60_000;

    /** 数据队列 */
    private queue: QueueEntry[] = [];

    constructor(private readonly io: SocketIOServer) {}

    // ============================================================
    // 生命周期
    // ============================================================

    /** 启动 (注册新连接推送回调) */
    start(): void {
        // 新连接时推送所有 queue 中已有数据
        this.io.on('connection', (socket) => {
            for (const entry of this.queue) {
                socket.emit(DelayQueue.EVENT, entry.snapshot);
            }
        });
    }

    /** 停止 */
    stop(): void {
        this.queue = [];
    }

    // ============================================================
    // 入队
    // ============================================================

    /**
     * 将采集数据入队并立即推送给所有已连接客户端
     */
    enqueue(snapshot: DataSnapshot): void {
        const releaseTime = Date.now();
        this.queue.push({ snapshot, releaseTime });

        // 丢弃超过 5 分钟的旧数据
        const cutoff = Date.now() - DelayQueue.MAX_RETENTION_MS;
        while (this.queue.length > 0 && this.queue[0]!.releaseTime < cutoff) {
            this.queue.shift();
        }

        // 立即推送
        this.io.emit(DelayQueue.EVENT, snapshot);
    }
}
