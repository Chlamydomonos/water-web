<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElSteps, ElStep, ElInputNumber, ElTable, ElTableColumn, ElMessage, ElMessageBox, ElIcon } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';
import { api } from '@/lib/api';
import { useDataStore } from '@/stores/data';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { ScatterChart, LineChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CalibrationPointDto, CalibrationStatusResponse, CalibrationCalculateResponse, SensorDto } from 'shared';

use([ScatterChart, LineChart, TitleComponent, TooltipComponent, GridComponent, CanvasRenderer]);

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();

const sensorId = Number(route.params.id);

// ---- 步骤 ----
const step = ref(0);
const steps = ['采集数据', '查看数据', '计算拟合', '确认结果'];

// ---- 传感器信息 ----
const sensorName = ref('');

// ---- 校准状态 ----
const points = ref<CalibrationPointDto[]>([]);
const formula = ref<{ slope: number; intercept: number } | null>(null);
const rSquared = ref<number | null>(null);
const calibrating = ref(false);

// ---- 步骤 1: 输入实际含水量 ----
const actualMoisture = ref<number>(25);
const submitting = ref(false);
const latestPulseCount = computed(() => {
    const snap = dataStore.latestSnapshot;
    if (!snap) return null;
    const sensor = snap.sensors.find((s) => s.sensorId === sensorId);
    return sensor?.pulseCount ?? null;
});

async function submitDataPoint() {
    if (actualMoisture.value == null) return;
    submitting.value = true;
    try {
        const res = await api.post<CalibrationPointDto>('/api/sensors/calibration/submit-data', {
            sensorId,
            actualMoisture: actualMoisture.value,
        });
        if (res.success) {
            points.value.push(res.data);
            ElMessage.success('数据点已提交');
        } else {
            ElMessage.error(res.error?.message ?? '提交失败');
        }
    } finally {
        submitting.value = false;
    }
}

// ---- 步骤 2: 查看数据 ----
const scatterOption = computed(() => {
    const data = points.value.map((p) => [p.pulseCount, p.actualMoisture] as [number, number]);
    return {
        grid: { top: 16, right: 16, bottom: 36, left: 48 },
        xAxis: { type: 'value' as const, name: '脉冲计数' },
        yAxis: { type: 'value' as const, name: '含水量 (%)' },
        series: [
            {
                type: 'scatter' as const,
                data,
                symbolSize: 10,
                itemStyle: { color: 'var(--color-primary)' },
            },
        ],
    };
});

// ---- 步骤 3: 计算 ----
const calculating = ref(false);

async function doCalculate() {
    calculating.value = true;
    try {
        const res = await api.post<CalibrationCalculateResponse>('/api/sensors/calibration/calculate', {
            sensorId,
        });
        if (res.success) {
            formula.value = { slope: res.data.slope, intercept: res.data.intercept };
            rSquared.value = res.data.rSquared;
            ElMessage.success('计算完成');
        } else {
            ElMessage.error(res.error?.message ?? '计算失败');
        }
    } finally {
        calculating.value = false;
    }
}

const fitLineOption = computed(() => {
    if (!formula.value) return {};
    const scatterData = points.value.map((p) => [p.pulseCount, p.actualMoisture] as [number, number]);
    const xMin = Math.min(...points.value.map((p) => p.pulseCount));
    const xMax = Math.max(...points.value.map((p) => p.pulseCount));
    const f = formula.value;
    return {
        grid: { top: 16, right: 16, bottom: 36, left: 48 },
        xAxis: { type: 'value' as const, name: '脉冲计数' },
        yAxis: { type: 'value' as const, name: '含水量 (%)' },
        series: [
            {
                type: 'scatter' as const,
                data: scatterData,
                symbolSize: 10,
                itemStyle: { color: 'var(--color-primary)' },
            },
            {
                type: 'line' as const,
                data: [
                    [xMin, f.slope * xMin + f.intercept],
                    [xMax, f.slope * xMax + f.intercept],
                ],
                lineStyle: { color: 'var(--color-danger)', type: 'dashed' as const },
                symbol: 'none' as const,
            },
        ],
    };
});

// ---- 步骤 4: 确认 ----
const confirming = ref(false);

async function confirmApply() {
    confirming.value = true;
    try {
        // Stop calibration -> applies formula
        const res = await api.post('/api/sensors/calibration/stop', { sensorId });
        if (res.success) {
            ElMessage.success('校准完成，公式已应用');
            router.push('/sensors');
        } else {
            ElMessage.error(res.error?.message ?? '应用失败');
        }
    } finally {
        confirming.value = false;
    }
}

// ---- 退出校准 ----
async function exitCalibration() {
    try {
        await ElMessageBox.confirm('退出校准将丢弃未保存的计算结果。已提交的数据点会保留。', '确认退出', {
            confirmButtonText: '退出',
            cancelButtonText: '取消',
            type: 'warning',
        });
        await api.post('/api/sensors/calibration/stop', { sensorId });
    } catch {
        // 用户取消
    }
    router.push('/sensors');
}

// ---- 导航 ----
function nextStep() {
    if (step.value < 3) step.value++;
}
function prevStep() {
    if (step.value > 0) step.value--;
}

// ---- 初始化 ----
onMounted(async () => {
    // 获取传感器名称
    const sensorRes = await api.post<SensorDto[]>('/api/sensors/list');
    if (sensorRes.success) {
        const s = sensorRes.data.find((s: SensorDto) => s.id === sensorId);
        if (s) sensorName.value = s.name;
    }

    // 获取校准状态
    const statusRes = await api.post<CalibrationStatusResponse>('/api/sensors/calibration/status', {
        sensorId,
    });
    if (statusRes.success) {
        points.value = statusRes.data.points ?? [];
        calibrating.value = statusRes.data.calibrating;
        if (statusRes.data.calibrated && statusRes.data.formula) {
            formula.value = statusRes.data.formula;
        }
    }

    // 开始校准模式
    const startRes = await api.post('/api/sensors/calibration/start', { sensorId });
    if (startRes.success) {
        calibrating.value = true;
    }
});

onBeforeUnmount(async () => {
    // 离开页面前停止校准
    if (calibrating.value) {
        await api.post('/api/sensors/calibration/stop', { sensorId });
    }
});
</script>

<template>
    <div class="calibration-page">
        <div class="calibration-page__header">
            <h2>传感器校准 — {{ sensorName || `#${sensorId}` }}</h2>
            <button class="calibration-page__exit-btn" @click="exitCalibration">退出校准</button>
        </div>

        <!-- 步骤条 -->
        <ElSteps :active="step" align-center class="calibration-page__steps">
            <ElStep v-for="(s, i) in steps" :key="i" :title="s" @click="step = i" />
        </ElSteps>

        <div class="calibration-page__content">
            <!-- ==================== 步骤 1: 采集数据 ==================== -->
            <div v-if="step === 0" class="calibration-step">
                <div class="calibration-step__pulse">
                    <span class="calibration-step__label">当前脉冲计数</span>
                    <span class="calibration-step__pulse-value">
                        {{ latestPulseCount !== null ? latestPulseCount.toLocaleString() : '暂无数据 — 请等待采集' }}
                    </span>
                    <span class="calibration-step__hint">自动读取最近采集数据，每秒刷新</span>
                </div>

                <div class="calibration-step__input">
                    <label class="calibration-step__label">实际含水量 (%)</label>
                    <ElInputNumber v-model="actualMoisture" :min="0" :max="100" style="width: 100%" />
                    <span class="calibration-step__hint">输入烘干称重法测量的含水量</span>
                </div>

                <button
                    class="calibration-step__primary-btn"
                    :disabled="submitting || latestPulseCount === null"
                    @click="submitDataPoint"
                >
                    {{ submitting ? '提交中...' : '提交此数据点' }}
                </button>

                <div class="calibration-step__summary">
                    已提交数据点: <strong>{{ points.length }} 个</strong>
                </div>
                <p v-if="points.length > 0" class="calibration-step__latest">
                    最新: 脉冲 {{ points[points.length - 1]!.pulseCount }} → 含水量
                    {{ points[points.length - 1]!.actualMoisture }}%
                </p>

                <button class="calibration-step__secondary-btn" :disabled="points.length < 2" @click="nextStep">
                    下一步: 查看数据
                </button>
            </div>

            <!-- ==================== 步骤 2: 查看数据 ==================== -->
            <div v-if="step === 1" class="calibration-step">
                <ElTable :data="points" style="width: 100%">
                    <ElTableColumn type="index" label="#" width="50" />
                    <ElTableColumn label="脉冲计数">
                        <template #default="{ row }">
                            {{ (row as CalibrationPointDto).pulseCount.toLocaleString() }}
                        </template>
                    </ElTableColumn>
                    <ElTableColumn label="实际含水量 (%)">
                        <template #default="{ row }"> {{ (row as CalibrationPointDto).actualMoisture }}% </template>
                    </ElTableColumn>
                    <ElTableColumn label="时间" width="160">
                        <template #default="{ row }">
                            {{ new Date((row as CalibrationPointDto).createdAt).toLocaleTimeString('zh-CN') }}
                        </template>
                    </ElTableColumn>
                </ElTable>

                <p class="calibration-step__count">数据点: {{ points.length }} (至少需要 2 个)</p>

                <div class="calibration-step__chart">
                    <VChart :option="scatterOption" autoresize />
                </div>

                <div class="calibration-step__actions">
                    <button class="calibration-step__secondary-btn" @click="prevStep">上一步</button>
                    <button class="calibration-step__primary-btn" :disabled="points.length < 2" @click="nextStep">
                        下一步: 计算拟合
                    </button>
                </div>
            </div>

            <!-- ==================== 步骤 3: 计算拟合 ==================== -->
            <div v-if="step === 2" class="calibration-step">
                <button class="calibration-step__primary-btn" :disabled="calculating" @click="doCalculate">
                    {{ calculating ? '计算中...' : '计算' }}
                </button>

                <div v-if="formula" class="calibration-step__result">
                    <p class="calibration-step__formula">
                        公式: 含水量 = {{ formula.slope.toFixed(4) }} × 脉冲
                        <template v-if="formula.intercept >= 0">+</template>{{ formula.intercept.toFixed(1) }}
                    </p>
                    <p class="calibration-step__rsquared">R² = {{ rSquared?.toFixed(3) ?? '—' }}</p>
                    <p class="calibration-step__point-count">数据点: {{ points.length }}</p>
                    <p v-if="rSquared !== null && rSquared < 0.8" class="calibration-step__warning">
                        <el-icon class="inline-icon"><WarningFilled /></el-icon>
                        拟合度偏低，建议添加更多数据点或检查测量准确性
                    </p>
                </div>

                <div v-if="formula" class="calibration-step__chart">
                    <VChart :option="fitLineOption" autoresize />
                </div>

                <div class="calibration-step__actions">
                    <button class="calibration-step__secondary-btn" @click="prevStep">上一步</button>
                    <button class="calibration-step__primary-btn" :disabled="!formula" @click="nextStep">
                        下一步: 确认结果
                    </button>
                </div>
            </div>

            <!-- ==================== 步骤 4: 确认结果 ==================== -->
            <div v-if="step === 3" class="calibration-step calibration-step--confirm">
                <div class="calibration-step__confirm-card">
                    <p><strong>传感器:</strong> {{ sensorName || `#${sensorId}` }}</p>
                    <p v-if="formula">
                        <strong>拟合公式:</strong> 含水量 = {{ formula.slope.toFixed(4) }} × 脉冲
                        <template v-if="formula.intercept >= 0">+</template>{{ formula.intercept.toFixed(1) }}
                    </p>
                    <p v-if="rSquared !== null"><strong>R²:</strong> {{ rSquared.toFixed(3) }}</p>
                </div>
                <p class="calibration-step__note">确认后，该传感器将启用含水量转换。之前的数据不受影响。</p>
                <div class="calibration-step__actions">
                    <button class="calibration-step__secondary-btn" @click="prevStep">返回修改</button>
                    <button class="calibration-step__primary-btn" :disabled="confirming" @click="confirmApply">
                        {{ confirming ? '应用中...' : '确认应用' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.calibration-page {
    padding: var(--space-lg) var(--padding-pc);
    max-width: 720px;
    margin: 0 auto;

    @media (max-width: 767px) {
        padding: var(--space-md) var(--padding-mobile);
    }
}

.calibration-page__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);

    h2 {
        font-size: var(--font-size-xl);
        color: var(--color-text);
        margin: 0;
    }
}

.calibration-page__exit-btn {
    background: none;
    border: 1px solid var(--color-danger);
    border-radius: 8px;
    color: var(--color-danger);
    padding: var(--space-sm) var(--space-md);
    font-size: var(--font-size-sm);
    cursor: pointer;
    min-height: var(--touch-min);

    &:hover {
        background: var(--color-danger);
        color: #fff;
    }
}

.calibration-page__steps {
    margin-bottom: var(--space-xl);
}

.calibration-page__content {
    min-height: 400px;
}

// ---- 步骤通用 ----
.calibration-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
}

// ---- 步骤 1 ----
.calibration-step__pulse {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    align-items: center;
    padding: var(--space-xl);
    background: var(--color-bg-secondary);
    border-radius: var(--card-radius);
}

.calibration-step__label {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}

.calibration-step__pulse-value {
    font-size: var(--font-size-xxl);
    font-weight: 700;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;
}

.calibration-step__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

.calibration-step__input {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
}

// ---- 按钮 ----
.calibration-step__primary-btn {
    width: 100%;
    height: 48px;
    border: none;
    border-radius: 8px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-md);
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

.calibration-step__secondary-btn {
    width: 100%;
    height: 48px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--color-text);
    font-size: var(--font-size-md);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-min);

    &:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

.calibration-step__actions {
    display: flex;
    gap: var(--space-md);
}

// ---- 摘要 ----
.calibration-step__summary {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    text-align: center;
}

.calibration-step__latest {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    text-align: center;
}

// ---- 步骤 2 ----
.calibration-step__count {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}

.calibration-step__chart {
    width: 100%;
    height: 300px;
}

// ---- 步骤 3 ----
.calibration-step__result {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-lg);
    background: var(--color-bg-secondary);
    border-radius: var(--card-radius);
}

.calibration-step__formula {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    font-family: 'Courier New', monospace;
}

.calibration-step__rsquared {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0;
}

.calibration-step__point-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin: 0;
}

.calibration-step__warning {
    font-size: var(--font-size-sm);
    color: var(--color-warning);
    margin: 0;
}

// ---- 步骤 4 ----
.calibration-step--confirm {
    gap: var(--space-xl);
}

.calibration-step__confirm-card {
    padding: var(--space-lg);
    background: var(--color-bg-secondary);
    border-radius: var(--card-radius);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);

    p {
        margin: 0;
        font-size: var(--font-size-md);
        color: var(--color-text);
    }
}

.calibration-step__note {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    text-align: center;
    margin: 0;
}

// ---- 内联图标 ----
.inline-icon {
    vertical-align: -0.15em;
    margin-right: 2px;
}
</style>
