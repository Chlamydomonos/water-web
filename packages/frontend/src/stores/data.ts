import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api';
import type { DataSnapshot, DataPoint, LatestDataResponse } from 'shared';

export const useDataStore = defineStore('data', () => {
    // ---- 状态 ----
    /**
     * 待显示缓冲区: 已接收但尚未到显示时间 (60s 延迟) 的快照。
     * 后端采集后立即推送，延迟显示逻辑在前端实现。
     */
    const pendingBuffer = ref<DataSnapshot[]>([]);
    /** 已释放 (可显示) 的数据缓冲区 */
    const dataBuffer = ref<DataSnapshot[]>([]);
    const history = ref<DataPoint[]>([]);
    // 图表最多显示 5 分钟数据: ESP32 每 1s 采样一次 (后端每 30s 拉取约 30 个点) → 5 分钟 ≈ 300 个快照
    const bufferMaxSize = 300;

    /** 显示延迟 (毫秒): 快照滞后真实时间 60 秒显示 */
    const DISPLAY_DELAY_MS = 60_000;

    // ---- 计算属性 ----
    const latestSnapshot = computed<DataSnapshot | null>(() => {
        if (dataBuffer.value.length === 0) return null;
        return dataBuffer.value[dataBuffer.value.length - 1] ?? null;
    });
    const latestMoisture = computed<number | null>(() => latestSnapshot.value?.avgMoisture ?? null);

    // 仪表盘 / 历史等其他页面图表显示时将含水量截断到 [0, 100] 范围内
    // （校准页面不截断，以显示原始测量值）
    const clampMoisture = (v: number | null): number | null => (v === null ? null : Math.max(0, Math.min(100, v)));

    const chartMoistureSeries = computed(() =>
        dataBuffer.value.map((d) => [d.timestamp, clampMoisture(d.avgMoisture)] as [number, number | null]),
    );
    const chartValveSeries = computed(() =>
        dataBuffer.value.map((d) => [d.timestamp, d.valveState] as [number, 0 | 1]),
    );
    /**
     * 按传感器分组的含水量序列 (供仪表盘多曲线图表使用)
     * key 为 sensorId，value 为 [timestamp(ms), moisture] 序列
     */
    const chartMoistureSeriesBySensor = computed(() => {
        const map = new Map<number, [number, number | null][]>();
        for (const snap of dataBuffer.value) {
            for (const s of snap.sensors) {
                if (!map.has(s.sensorId)) map.set(s.sensorId, []);
                map.get(s.sensorId)!.push([snap.timestamp, clampMoisture(s.moisture)]);
            }
        }
        return map;
    });

    // ---- 内部工具 ----
    /**
     * 按时间戳排序并去除重复时间戳的快照 (保留最新收到的)。
     * 防止 socket 重连补发 / REST 补全与实时推送产生重复数据点。
     */
    function sortAndDedupe(snapshots: DataSnapshot[]): DataSnapshot[] {
        const byTs = new Map<number, DataSnapshot>();
        for (const snap of snapshots) {
            byTs.set(snap.timestamp, snap);
        }
        return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
    }

    /** 将快照加入待显示缓冲区 (排序 + 去重) */
    function addToPending(snapshots: DataSnapshot[]) {
        if (snapshots.length === 0) return;
        pendingBuffer.value = sortAndDedupe([...pendingBuffer.value, ...snapshots]);
    }

    // ---- 操作 ----
    function pushSnapshot(snapshot: DataSnapshot) {
        addToPending([snapshot]);
    }

    /**
     * 每秒调用一次: 将到达显示时间的快照从 pendingBuffer 移入 dataBuffer。
     * 由 App.vue 的定时器驱动，实现图表每秒平滑更新。
     */
    function tick() {
        const now = Date.now();
        const cutoff = now - DISPLAY_DELAY_MS;

        // 找出所有已到显示时间的快照
        const ready: DataSnapshot[] = [];
        const remaining: DataSnapshot[] = [];
        for (const snap of pendingBuffer.value) {
            if (snap.timestamp <= cutoff) {
                ready.push(snap);
            } else {
                remaining.push(snap);
            }
        }
        if (ready.length === 0) return;

        pendingBuffer.value = remaining;
        dataBuffer.value = sortAndDedupe([...dataBuffer.value, ...ready]);
        // 丢弃超过 5 分钟的旧数据 (按时间戳判断，而非仅按条数)
        const expireBefore = now - 5 * 60_000;
        while (dataBuffer.value.length > 0 && dataBuffer.value[0]!.timestamp < expireBefore) {
            dataBuffer.value.shift();
        }
        // 兜底: 条数上限 (防止时间戳异常时缓冲无限增长)
        while (dataBuffer.value.length > bufferMaxSize) {
            dataBuffer.value.shift();
        }
    }

    function fillBuffer(snapshots: DataSnapshot[]) {
        // REST 补全的数据直接进入待显示缓冲区，由 tick 按时间释放
        addToPending(snapshots);
    }

    async function fetchLatest(minutes: number = 5) {
        const res = await api.post<LatestDataResponse>('/api/data/latest', { minutes });
        if (res.success && res.data) {
            const snapshots: DataSnapshot[] = res.data.readings.map((r) => ({
                ...r,
                timestamp: new Date(r.timestamp).getTime(),
            }));
            fillBuffer(snapshots);
        }
    }

    async function fetchHistory(from: string, to: string, resolution?: string) {
        const res = await api.post<DataPoint[]>('/api/data/history', { from, to, resolution });
        if (res.success) {
            history.value = res.data;
        }
    }

    return {
        dataBuffer,
        pendingBuffer,
        history,
        latestSnapshot,
        latestMoisture,
        chartMoistureSeries,
        chartMoistureSeriesBySensor,
        chartValveSeries,
        pushSnapshot,
        fillBuffer,
        tick,
        fetchLatest,
        fetchHistory,
    };
});
