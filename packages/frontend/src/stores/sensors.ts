import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api';
import type { SensorDto, SensorCreateRequest, SensorUpdateRequest } from 'shared';

export const useSensorStore = defineStore('sensors', () => {
    // ---- 状态 ----
    const sensors = ref<SensorDto[]>([]);
    const loading = ref(false);

    // ---- 计算属性 ----
    const healthySensors = computed(() => sensors.value.filter((s) => !s.faulty));
    const calibratedSensors = computed(() => sensors.value.filter((s) => s.calibrated));
    const faultySensorCount = computed(() => sensors.value.filter((s) => s.faulty).length);
    const sensorByAddr = computed(() => {
        const map = new Map<number, SensorDto>();
        sensors.value.forEach((s) => map.set(s.slaveAddr, s));
        return map;
    });

    // ---- 操作 ----
    async function fetchAll() {
        loading.value = true;
        const res = await api.post<SensorDto[]>('/api/sensors/list');
        if (res.success) sensors.value = res.data;
        loading.value = false;
    }

    async function create(req: SensorCreateRequest): Promise<SensorDto | null> {
        const res = await api.post<SensorDto>('/api/sensors/create', req as unknown as Record<string, unknown>);
        if (res.success) {
            sensors.value.push(res.data);
            return res.data;
        }
        return null;
    }

    async function update(req: SensorUpdateRequest): Promise<SensorDto | null> {
        const res = await api.post<SensorDto>('/api/sensors/update', req as unknown as Record<string, unknown>);
        if (res.success) {
            const idx = sensors.value.findIndex((s) => s.id === req.id);
            if (idx >= 0) sensors.value[idx] = res.data;
            return res.data;
        }
        return null;
    }

    async function remove(id: number): Promise<boolean> {
        const res = await api.post('/api/sensors/delete', { id });
        if (res.success) {
            sensors.value = sensors.value.filter((s) => s.id !== id);
            return true;
        }
        return false;
    }

    function handleSensorChanged(sensor: SensorDto) {
        const idx = sensors.value.findIndex((s) => s.id === sensor.id);
        if (idx >= 0) sensors.value[idx] = sensor;
    }

    return {
        sensors,
        loading,
        healthySensors,
        calibratedSensors,
        faultySensorCount,
        sensorByAddr,
        fetchAll,
        create,
        update,
        remove,
        handleSensorChanged,
    };
});
