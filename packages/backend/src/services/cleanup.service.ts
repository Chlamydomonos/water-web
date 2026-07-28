/**
 * CleanupService — 数据聚合与清理服务
 *
 * 每日凌晨 02:00 执行数据保留策略:
 *   1. 昨天数据 → AggregatedData(second)
 *   2. 8 天前 second 级数据 → AggregatedData(hour)
 *   3. 30 天前 hour 级数据 → 删除
 *
 * 参考: docs/backend-design.md §3 §4.3 数据保留策略
 */

import { Op, fn, col, literal } from '@sequelize/core';
import { RawReading } from '../db/models/RawReading.js';
import { RawSensorReading } from '../db/models/RawSensorReading.js';
import { AggregatedData } from '../db/models/AggregatedData.js';

/** 每日清理时间 (24h 制小时) */
const CLEANUP_HOUR = 2;

export class CleanupService {
    /** 定时器句柄 */
    private timer: ReturnType<typeof setInterval> | null = null;

    // ============================================================
    // 生命周期
    // ============================================================

    /** 启动每日清理定时器 (每分钟检查是否到达 02:00) */
    start(): void {
        if (this.timer) return;
        console.log('[cleanup] daily cleanup scheduler started (target: 02:00)');

        // 每分钟检查一次
        this.timer = setInterval(() => {
            const now = new Date();
            if (now.getHours() === CLEANUP_HOUR && now.getMinutes() === 0) {
                this.runCleanup();
            }
        }, 60_000);
    }

    /** 停止定时器 */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // ============================================================
    // 清理逻辑
    // ============================================================

    /**
     * 执行三步清理 (可手动调用用于测试)
     */
    async runCleanup(): Promise<void> {
        console.log('[cleanup] starting daily data cleanup...');
        const startedAt = Date.now();

        try {
            await this.aggregateYesterdayToSecond();
            await this.aggregateOldSecondToHour();
            await this.deleteStaleHourly();
        } catch (err) {
            console.error('[cleanup] error during cleanup:', err);
            return;
        }

        const elapsed = Date.now() - startedAt;
        console.log(`[cleanup] daily cleanup completed in ${elapsed}ms`);
    }

    // ============================================================
    // 步骤 1: 昨天 RawReading → AggregatedData(second)
    // ============================================================

    private async aggregateYesterdayToSecond(): Promise<void> {
        // 昨天 00:00:00 ~ 今天 00:00:00
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterdayStart = new Date(today.getTime() - 24 * 60 * 60_000);

        // 查询昨天的所有 RawReading
        const readings = await RawReading.findAll({
            where: {
                timestamp: {
                    [Op.gte]: yesterdayStart,
                    [Op.lt]: today,
                },
            },
            order: [['timestamp', 'ASC']],
        });

        if (readings.length === 0) {
            console.log('[cleanup] step 1: no yesterday data to aggregate');
            return;
        }

        // 按秒分组聚合
        const groups = new Map<number, number[]>();
        for (const r of readings) {
            if (r.avgMoisture == null) continue;
            // 截断到秒
            const secTs = Math.floor(r.timestamp.getTime() / 1000) * 1000;
            if (!groups.has(secTs)) groups.set(secTs, []);
            groups.get(secTs)!.push(r.avgMoisture);
        }

        // 批量写入 AggregatedData
        const rows = Array.from(groups.entries()).map(([secTs, values]) => ({
            timestamp: new Date(secTs),
            resolution: 'second' as const,
            avgMoisture: values.reduce((a, b) => a + b, 0) / values.length,
        }));

        await AggregatedData.bulkCreate(rows);
        console.log(`[cleanup] step 1: aggregated ${rows.length} second-level records`);

        // 删除昨天的 RawReading + RawSensorReading
        const deletedRaw = await RawReading.destroy({
            where: {
                timestamp: {
                    [Op.gte]: yesterdayStart,
                    [Op.lt]: today,
                },
            },
        });
        console.log(`[cleanup] step 1: deleted ${deletedRaw} RawReading records`);
    }

    // ============================================================
    // 步骤 2: 8 天前 AggregatedData(second) → AggregatedData(hour)
    // ============================================================

    private async aggregateOldSecondToHour(): Promise<void> {
        // 8 天前 00:00:00 ~ 7 天前 00:00:00
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const day8Start = new Date(today.getTime() - 8 * 24 * 60 * 60_000);
        const day7Start = new Date(today.getTime() - 7 * 24 * 60 * 60_000);

        // 查询 8 天前的 second 级聚合数据
        const records = await AggregatedData.findAll({
            where: {
                resolution: 'second',
                timestamp: {
                    [Op.gte]: day8Start,
                    [Op.lt]: day7Start,
                },
            },
            order: [['timestamp', 'ASC']],
        });

        if (records.length === 0) {
            console.log('[cleanup] step 2: no 8-day-old second data to aggregate');
            return;
        }

        // 按小时分组聚合
        const groups = new Map<number, number[]>();
        for (const r of records) {
            const hourTs = Math.floor(r.timestamp.getTime() / 3_600_000) * 3_600_000;
            if (!groups.has(hourTs)) groups.set(hourTs, []);
            groups.get(hourTs)!.push(r.avgMoisture);
        }

        // 批量写入 AggregatedData(hour)
        const rows = Array.from(groups.entries()).map(([hourTs, values]) => ({
            timestamp: new Date(hourTs),
            resolution: 'hour' as const,
            avgMoisture: values.reduce((a, b) => a + b, 0) / values.length,
        }));

        await AggregatedData.bulkCreate(rows);
        console.log(`[cleanup] step 2: aggregated ${rows.length} hour-level records`);

        // 删除 8 天前的 second 级数据
        const deleted = await AggregatedData.destroy({
            where: {
                resolution: 'second',
                timestamp: {
                    [Op.gte]: day8Start,
                    [Op.lt]: day7Start,
                },
            },
        });
        console.log(`[cleanup] step 2: deleted ${deleted} second-level records`);
    }

    // ============================================================
    // 步骤 3: 删除 30 天前的 AggregatedData(hour)
    // ============================================================

    private async deleteStaleHourly(): Promise<void> {
        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setTime(cutoff.getTime() - 30 * 24 * 60 * 60_000);

        const deleted = await AggregatedData.destroy({
            where: {
                resolution: 'hour',
                timestamp: { [Op.lt]: cutoff },
            },
        });
        if (deleted > 0) {
            console.log(`[cleanup] step 3: deleted ${deleted} stale hourly records`);
        } else {
            console.log('[cleanup] step 3: no stale hourly data to delete');
        }
    }
}
