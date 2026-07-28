<script setup lang="ts">
import { useSystemStore } from '@/stores/system';
import { useSensorStore } from '@/stores/sensors';
import { useDataStore } from '@/stores/data';
import { useTaskStore } from '@/stores/tasks';
import { useThemeStore } from '@/stores/theme';
import StatusCard from '@/components/StatusCard.vue';
import MoistureBadge from '@/components/MoistureBadge.vue';
import EmptyState from '@/components/EmptyState.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Timer } from '@element-plus/icons-vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
    TitleComponent,
    TooltipComponent,
    GridComponent,
    DataZoomComponent,
    GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { ElIcon } from 'element-plus';

use([LineChart, TitleComponent, TooltipComponent, GridComponent, DataZoomComponent, GraphicComponent, CanvasRenderer]);

const router = useRouter();
const systemStore = useSystemStore();
const sensorStore = useSensorStore();
const dataStore = useDataStore();
const taskStore = useTaskStore();
const themeStore = useThemeStore();

/** 读取 document 上的 CSS 自定义属性实际值 */
function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- 实时图表配置 ----
const chartOption = computed<EChartsOption>(() => {
    // 依赖 themeStore.mode 以在主题切换时重新计算
    void themeStore.mode;

    const axisColor = cssVar('--chart-axis');
    const gridColor = cssVar('--chart-grid');
    const lineColor = cssVar('--chart-line');
    const fillColor = cssVar('--chart-fill');
    const mutedColor = cssVar('--color-text-muted');
    const moistureData = dataStore.chartMoistureSeries;
    const hasData = moistureData.length > 0;

    const baseOption: EChartsOption = {
        animation: false,
        tooltip: {
            trigger: 'axis',
            formatter: (params: unknown) => {
                const p = (params as { data: [string, number | null] }[])[0];
                if (!p) return '';
                const ts = new Date(p.data[0]).toLocaleTimeString('zh-CN');
                const val = p.data[1] !== null ? `${p.data[1]}%` : 'N/A';
                return `${ts}<br/>含水量: ${val}`;
            },
        },
        grid: { top: 16, right: 16, bottom: 36, left: 40 },
        xAxis: {
            type: 'time',
            axisLabel: {
                formatter: (val: number) => {
                    const d = new Date(val);
                    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                },
                fontSize: 11,
                color: axisColor,
            },
            axisLine: { lineStyle: { color: gridColor } },
            axisTick: { show: false },
            splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            min: 0,
            max: 100,
            axisLabel: { fontSize: 11, color: axisColor, formatter: '{value}%' },
            splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
        },
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100,
            },
        ],
        series: [
            {
                type: 'line',
                data: moistureData,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: lineColor, width: 2 },
                areaStyle: { color: fillColor },
                connectNulls: false,
            },
        ],
    };

    if (!hasData) {
        baseOption.graphic = {
            type: 'text',
            left: 'center',
            top: 'center',
            style: {
                text: systemStore.espConnected ? '等待采集数据...' : '设备未连接',
                fontSize: 14,
                fill: mutedColor,
            },
        };
    }

    return baseOption;
});

// 监听数据缓冲更新图表
const chartRef = ref<InstanceType<typeof VChart> | null>(null);

// ---- 传感器健康芯片 ----
const sensorHealthList = computed(() => {
    const snapshot = dataStore.latestSnapshot;
    return sensorStore.sensors.map((s) => {
        const sensorSnap = snapshot?.sensors.find((ss) => ss.sensorId === s.id);
        return {
            ...s,
            moisture: sensorSnap?.moisture ?? null,
            pulseCount: sensorSnap?.pulseCount ?? 0,
            crcValid: sensorSnap?.crc8Valid ?? false,
        };
    });
});

function healthColor(sensor: (typeof sensorHealthList.value)[number]) {
    if (sensor.faulty) return 'red';
    if (!sensor.calibrated) return 'yellow';
    return 'green';
}

function healthLabel(sensor: (typeof sensorHealthList.value)[number]) {
    if (sensor.faulty) return '故障';
    if (!sensor.calibrated) return '未校准';
    return sensor.moisture !== null ? `${sensor.moisture}%` : 'N/A';
}

function goToSensors() {
    router.push('/sensors');
}

function goToManualIrrigation() {
    router.push('/tasks?action=manual');
}
</script>

<template>
    <div class="dashboard-page">
        <!-- 系统状态卡片 -->
        <section class="dashboard-page__status-cards">
            <StatusCard title="阀门状态" :value="systemStore.isValveOpen ? '灌溉中' : '已关闭'" />
            <StatusCard title="ESP32 连接" :value="systemStore.espStatusText" />
            <StatusCard title="活跃任务" :value="taskStore.runningTasks.length" />
            <StatusCard
                title="传感器健康"
                :value="`${sensorStore.healthySensors.length}/${sensorStore.sensors.length}`"
            />
        </section>

        <!-- 实时含水量图表 -->
        <section class="dashboard-page__chart">
            <h3 class="dashboard-page__section-title">实时含水量</h3>
            <div class="dashboard-page__chart-container">
                <VChart ref="chartRef" :option="chartOption" autoresize />
            </div>
        </section>

        <!-- 传感器健康网格 -->
        <section class="dashboard-page__sensor-health">
            <h3 class="dashboard-page__section-title">传感器健康</h3>
            <EmptyState
                v-if="sensorStore.sensors.length === 0"
                message="暂无传感器，请先添加"
                action-label="添加第一个传感器"
                @action="goToSensors"
            />
            <div v-else class="dashboard-page__sensor-grid">
                <div
                    v-for="sensor in sensorHealthList"
                    :key="sensor.id"
                    class="sensor-health-chip"
                    :class="`sensor-health-chip--${healthColor(sensor)}`"
                    @click="goToSensors"
                >
                    <div class="sensor-health-chip__dot"></div>
                    <div class="sensor-health-chip__info">
                        <span class="sensor-health-chip__name">{{ sensor.name }}</span>
                        <span class="sensor-health-chip__label">{{ healthLabel(sensor) }}</span>
                    </div>
                    <MoistureBadge v-if="sensor.moisture !== null" :value="sensor.moisture" />
                </div>
            </div>
        </section>

        <!-- 移动端快捷操作栏 -->
        <div class="quick-action-bar hide-on-pc">
            <button class="quick-action-bar__btn" :disabled="!systemStore.espConnected" @click="goToManualIrrigation">
                <el-icon class="btn-icon"><Timer /></el-icon> 手动灌溉
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.dashboard-page {
    max-width: var(--content-max-width);
    margin: 0 auto;
    padding: var(--padding-pc);
    padding-bottom: 80px; // 为移动端快捷操作栏留空间

    @media (max-width: 767px) {
        padding: var(--padding-mobile);
        padding-bottom: 80px;
    }
}

.dashboard-page__section-title {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: var(--space-md);
}

// ---- 状态卡片 ----
.dashboard-page__status-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    margin-bottom: var(--space-lg);

    @media (max-width: 767px) {
        grid-template-columns: repeat(2, 1fr);
    }
}

// ---- 实时图表 ----
.dashboard-page__chart {
    margin-bottom: var(--space-lg);
}

.dashboard-page__chart-container {
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    padding: var(--space-md);
    height: 320px;

    @media (max-width: 767px) {
        height: 240px;
        padding: var(--space-sm);
    }
}

// ---- 传感器健康网格 ----
.dashboard-page__sensor-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-sm);

    @media (max-width: 1023px) {
        grid-template-columns: repeat(3, 1fr);
    }

    @media (max-width: 767px) {
        grid-template-columns: repeat(2, 1fr);
    }
}

// ---- SensorHealthChip ----
.sensor-health-chip {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    cursor: pointer;
    transition: border-color var(--transition-fast);
    min-height: var(--touch-min);

    &:hover {
        border-color: var(--color-primary);
    }

    &--red {
        border-left: 3px solid var(--color-danger);
    }

    &--yellow {
        border-left: 3px solid var(--color-warning);
    }

    &--green {
        border-left: 3px solid var(--color-success);
    }
}

.sensor-health-chip__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    .sensor-health-chip--green & {
        background: var(--dot-green);
    }
    .sensor-health-chip--yellow & {
        background: var(--dot-yellow);
    }
    .sensor-health-chip--red & {
        background: var(--dot-red);
    }
}

.sensor-health-chip__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
}

.sensor-health-chip__name {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sensor-health-chip__label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

// ---- 移动端快捷操作栏 ----
.quick-action-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 64px;
    padding: 8px var(--padding-mobile);
    background: var(--card-bg);
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    z-index: 50;
}

.quick-action-bar__btn {
    width: 100%;
    height: var(--touch-min);
    border: none;
    border-radius: 8px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-lg);
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--transition-fast);

    &:hover:not(:disabled) {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

// ---- 内联图标 ----
.btn-icon {
    vertical-align: -0.15em;
    margin-right: 4px;
}
</style>
