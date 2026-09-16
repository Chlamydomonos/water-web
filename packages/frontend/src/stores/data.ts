import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api';
import type { DataSnapshot, DataPoint, LatestDataResponse } from 'shared';

export const useDataStore = defineStore('data', () => {
    // ---- 状态 ----
    const dataBuffer = ref<DataSnapshot[]>([]);
    const history = ref<DataPoint[]>([]);
    const bufferMaxSize = 300; // 5分钟 × 60秒

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
     * key 为 sensorId，value 为 [timestamp, moisture] 序列
     */
    const chartMoistureSeriesBySensor = computed(() => {
        const map = new Map<number, [string, number | null][]>();
        for (const snap of dataBuffer.value) {
            for (const s of snap.sensors) {
                if (!map.has(s.sensorId)) map.set(s.sensorId, []);
                map.get(s.sensorId)!.push([String(snap.timestamp), clampMoisture(s.moisture)]);
            }
        }
        return map;
    });
    // ---- 操作 ----
    function pushSnapshot(snapshot: DataSnapshot) {
        dataBuffer.value.push(snapshot);
        while (dataBuffer.value.length > bufferMaxSize) {
            dataBuffer.value.shift();
        }
    }

    function fillBuffer(snapshots: DataSnapshot[]) {
        dataBuffer.value = snapshots.slice(-bufferMaxSize);
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
        history,
        latestSnapshot,
        latestMoisture,
        chartMoistureSeries,
        chartMoistureSeriesBySensor,
        chartValveSeries,
        pushSnapshot,
        fillBuffer,
        fetchLatest,
        fetchHistory,
    };
});
