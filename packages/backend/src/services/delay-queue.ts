/**
 * DelayQueue — 延迟推送队列
 *
 * 将不规则的 30s 采集间隔转化为 1s 平滑数据流，推送给前端。
 * 每条采集到的 DataSnapshot 进入队列后延迟 60 秒释放。
 *
 * 设计要点:
 *   - 每秒最多推送 1 条
 *   - 前端新连接时立即推送所有队列中的数据
 *   - 队列最多保留 5 分钟数据，防止内存溢出
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

    /** 延迟时长 (毫秒) */
    private static readonly DELAY_MS = 60_000;

    /** 最大保留时长 (毫秒) */
    private static readonly MAX_RETENTION_MS = 5 * 60_000;

    /** 数据队列 */
    private queue: QueueEntry[] = [];

    /** 1 秒推送定时器 */
    private pusherTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly io: SocketIOServer) {}

    // ============================================================
    // 生命周期
    // ============================================================

    /** 启动延迟推送定时器 (每秒检查) */
    start(): void {
        if (this.pusherTimer) return;

        // 新连接时推送所有 queue 中已有数据
        this.io.on('connection', (socket) => {
            for (const entry of this.queue) {
                socket.emit(DelayQueue.EVENT, entry.snapshot);
            }
        });

        // 每秒检查 releaseTime 已到的条目并推送
        this.pusherTimer = setInterval(() => {
            this.flushReady();
        }, 1000);
    }

    /** 停止定时器 */
    stop(): void {
        if (this.pusherTimer) {
            clearInterval(this.pusherTimer);
            this.pusherTimer = null;
        }
        this.queue = [];
    }

    // ============================================================
    // 入队
    // ============================================================

    /**
     * 将采集数据入队，标记 60 秒后释放
     */
    enqueue(snapshot: DataSnapshot): void {
        const releaseTime = Date.now() + DelayQueue.DELAY_MS;
        this.queue.push({ snapshot, releaseTime });

        // 丢弃超过 5 分钟的旧数据
        const cutoff = Date.now() - DelayQueue.MAX_RETENTION_MS;
        while (this.queue.length > 0 && this.queue[0]!.releaseTime < cutoff) {
            this.queue.shift();
        }
    }

    // ============================================================
    // 内部
    // ============================================================

    /**
     * 推送所有 releaseTime 已到的条目
     */
    private flushReady(): void {
        const now = Date.now();

        while (this.queue.length > 0 && this.queue[0]!.releaseTime <= now) {
            const entry = this.queue.shift()!;
            this.io.emit(DelayQueue.EVENT, entry.snapshot);
        }
    }
}
