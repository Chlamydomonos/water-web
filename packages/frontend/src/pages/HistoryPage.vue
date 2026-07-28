<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElDatePicker, ElRadioGroup, ElRadioButton } from 'element-plus';
import { useDataStore } from '@/stores/data';
import { useThemeStore } from '@/stores/theme';
import EmptyState from '@/components/EmptyState.vue';
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
import VChart from 'vue-echarts';
import type { DataPoint } from 'shared';

use([LineChart, TitleComponent, TooltipComponent, GridComponent, DataZoomComponent, GraphicComponent, CanvasRenderer]);

const dataStore = useDataStore();
const themeStore = useThemeStore();

/** 读取 document 上的 CSS 自定义属性实际值 */
function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- 时间范围 ----
const now = new Date();
const defaultStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const timeRange = ref<[Date, Date]>([defaultStart, now]);

// ---- 快捷键 ----
const shortcuts = [
    {
        text: '最近1小时',
        value: () => {
            const end = new Date();
            const start = new Date(end.getTime() - 3600000);
            return [start, end] as [Date, Date];
        },
    },
    {
        text: '最近6小时',
        value: () => {
            const end = new Date();
            const start = new Date(end.getTime() - 6 * 3600000);
            return [start, end] as [Date, Date];
        },
    },
    {
        text: '最近24小时',
        value: () => {
            const end = new Date();
            const start = new Date(end.getTime() - 24 * 3600000);
            return [start, end] as [Date, Date];
        },
    },
    {
        text: '最近7天',
        value: () => {
            const end = new Date();
            const start = new Date(end.getTime() - 7 * 24 * 3600000);
            return [start, end] as [Date, Date];
        },
    },
];

// ---- 分辨率 ----
const resolution = ref<'raw' | 'second' | 'hour'>('second');

// ---- 控制 ----
const loading = ref(false);

// ---- 初始加载 ----
async function loadHistory() {
    if (!timeRange.value || !timeRange.value[0] || !timeRange.value[1]) return;
    loading.value = true;
    try {
        await dataStore.fetchHistory(
            timeRange.value[0].toISOString(),
            timeRange.value[1].toISOString(),
            resolution.value,
        );
    } finally {
        loading.value = false;
    }
}

watch(timeRange, loadHistory, { deep: true });
watch(resolution, loadHistory);

// 初始化加载
loadHistory();

// ---- 图表 ----
const chartOption = computed(() => {
    // 依赖 themeStore.mode 以在主题切换时重新计算
    void themeStore.mode;

    const axisColor = cssVar('--chart-axis');
    const gridColor = cssVar('--chart-grid');
    const mutedColor = cssVar('--color-text-muted');
    const successColor = cssVar('--color-success');
    const points = dataStore.history as DataPoint[];
    if (!points?.length) {
        return {
            graphic: {
                type: 'text',
                left: 'center',
                top: 'center',
                style: {
                    text: '暂无数据',
                    fill: mutedColor,
                    fontSize: 14,
                },
            },
        };
    }

    const timestamps = points.map((p) => new Date(p.timestamp).toLocaleString('zh-CN'));
    const moistureData: [string, number | null][] = points.map((p) => [
        new Date(p.timestamp).toLocaleString('zh-CN'),
        p.avgMoisture,
    ]);

    const series: Array<{
        type: 'line';
        name: string;
        data: [string, number | null][];
        connectNulls: boolean;
        smooth: boolean;
        symbol: 'none';
        areaStyle?: { opacity: number };
        yAxisIndex?: number;
        lineStyle?: { opacity: number };
        itemStyle?: { color: string };
    }> = [
        {
            type: 'line' as const,
            name: '平均含水量',
            data: moistureData,
            connectNulls: false,
            smooth: true,
            symbol: 'none' as const,
            areaStyle: { opacity: 0.08 },
        },
    ];

    // 如果是原始数据则叠加阀门状态
    if (resolution.value === 'raw') {
        const valveData: [string, number | null][] = points.map((p) => [
            new Date(p.timestamp).toLocaleString('zh-CN'),
            p.valveState != null ? p.valveState * 100 : null,
        ]);
        series.push({
            type: 'line' as const,
            name: '阀门状态',
            data: valveData,
            connectNulls: false,
            smooth: false,
            symbol: 'none' as const,
            yAxisIndex: 1,
            lineStyle: { opacity: 0.6 },
            itemStyle: { color: successColor },
        });
    }

    return {
        tooltip: { trigger: 'axis' as const },
        grid: { top: 8, right: 60, bottom: 60, left: 48 },
        xAxis: {
            type: 'category' as const,
            data: timestamps,
            boundaryGap: false,
            axisLabel: { color: axisColor, fontSize: 11 },
            axisLine: { lineStyle: { color: gridColor } },
        },
        yAxis: {
            type: 'value' as const,
            name: '含水量 (%)',
            min: 0,
            max: 100,
            axisLabel: { color: axisColor, fontSize: 11 },
            splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
        },
        dataZoom: [{ type: 'slider' as const, bottom: 8 }],
        series,
    };
});
</script>

<template>
    <div class="history-page">
        <div class="history-page__header">
            <h2>历史数据</h2>
        </div>

        <!-- 时间范围选择器 -->
        <div class="history-page__controls">
            <ElDatePicker
                v-model="timeRange"
                type="datetimerange"
                :shortcuts="shortcuts"
                format="MM-DD HH:mm"
                style="width: 100%; max-width: 480px"
            />
            <ElRadioGroup v-model="resolution" size="small">
                <ElRadioButton value="raw">原始</ElRadioButton>
                <ElRadioButton value="second">秒级</ElRadioButton>
                <ElRadioButton value="hour">小时级</ElRadioButton>
            </ElRadioGroup>
        </div>

        <!-- 历史图表 -->
        <div class="history-page__chart" :class="{ 'history-page__chart--empty': dataStore.history.length === 0 }">
            <EmptyState v-if="dataStore.history.length === 0 && !loading" message="暂无历史数据，修改时间范围后重试" />
            <VChart v-show="dataStore.history.length > 0" :option="chartOption" :loading="loading" autoresize />
        </div>
    </div>
</template>

<style scoped lang="scss">
.history-page {
    padding: var(--space-lg) var(--padding-pc);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    height: 100%;

    @media (max-width: 767px) {
        padding: var(--space-md) var(--padding-mobile);
    }
}

.history-page__header {
    h2 {
        font-size: var(--font-size-xl);
        color: var(--color-text);
        margin: 0;
    }
}

.history-page__controls {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
}

.history-page__chart {
    flex: 1;
    min-height: 400px;
    position: relative;

    &--empty {
        display: flex;
        align-items: center;
        justify-content: center;
    }
}
</style>
