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
        dataBuffer.value.map((d) => [String(d.timestamp), clampMoisture(d.avgMoisture)] as [string, number | null]),
    );
    const chartValveSeries = computed(() =>
        dataBuffer.value.map((d) => [String(d.timestamp), d.valveState] as [string, 0 | 1]),
    );

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
        chartValveSeries,
        pushSnapshot,
        fillBuffer,
        fetchLatest,
        fetchHistory,
    };
});
