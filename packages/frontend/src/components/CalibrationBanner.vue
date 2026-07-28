<script setup lang="ts">
import { useSystemStore } from '@/stores/system';
import { useSensorStore } from '@/stores/sensors';
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';

const systemStore = useSystemStore();
const sensorStore = useSensorStore();

const sensorName = computed(() => {
    const sensor = sensorStore.sensors.find((s) => s.id === systemStore.calibratingSensorId);
    return sensor?.name ?? '未知传感器';
});
</script>

<template>
    <div class="calibration-banner">
        <el-icon class="calibration-banner__icon"><Setting /></el-icon>
        正在校准: {{ sensorName }}
    </div>
</template>

<style scoped lang="scss">
.calibration-banner {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: var(--banner-bg-info);
    color: var(--banner-text-info);
}

.calibration-banner__icon {
    flex-shrink: 0;
    font-size: 16px;
}
</style>
