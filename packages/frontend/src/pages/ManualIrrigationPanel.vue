<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useTaskStore } from '@/stores/tasks';
import { useSystemStore } from '@/stores/system';
import { useDataStore } from '@/stores/data';
import { ElIcon } from 'element-plus';
import {
    ArrowLeft,
    CaretTop,
    CaretBottom,
    Odometer,
    Setting,
    VideoPlay,
    VideoPause,
    CloseBold,
    CircleCheckFilled,
} from '@element-plus/icons-vue';
import type { ManualTaskConfigDto } from 'shared';

const props = defineProps<{
    visible: boolean;
}>();

const emit = defineEmits<{
    close: [];
}>();

const taskStore = useTaskStore();
const systemStore = useSystemStore();
const dataStore = useDataStore();

// ---- 时长选择 ----
const hours = ref(0);
const minutes = ref(5);
const seconds = ref(0);

const totalDuration = computed(() => hours.value * 3600 + minutes.value * 60 + seconds.value);

const display = computed(() => ({
    hours: String(hours.value).padStart(2, '0'),
    minutes: String(minutes.value).padStart(2, '0'),
    seconds: String(seconds.value).padStart(2, '0'),
}));

// ---- 快捷预设 ----
const presets = [
    { label: '1分钟', value: 60 },
    { label: '5分钟', value: 300 },
    { label: '10分钟', value: 600 },
    { label: '15分钟', value: 900 },
    { label: '30分钟', value: 1800 },
];

function applyPreset(secs: number) {
    hours.value = Math.floor(secs / 3600);
    minutes.value = Math.floor((secs % 3600) / 60);
    seconds.value = secs % 60;
}

function adjust(field: 'hours' | 'minutes' | 'seconds', delta: number) {
    const max = field === 'hours' ? 1 : 59;
    const val = { hours, minutes, seconds };
    val[field].value = Math.max(0, Math.min(max, val[field].value + delta));
}

// ---- 按住拖动调整时间（移动端友好） ----
// 通过监听 pointer 事件，根据垂直拖动距离按阈值改变对应字段。
// 每跨越 MOVE_STEP px 触发一次 ±1，配 touch-action: none 防止页面滚动。
const DRAG_MOVE_STEP = 24; // 每多少像素触发一次增减
const dragState = ref<{
    field: 'hours' | 'minutes' | 'seconds';
    startY: number;
    accumulated: number;
    pointerId: number;
} | null>(null);

function onPickerPointerDown(e: PointerEvent, field: 'hours' | 'minutes' | 'seconds') {
    // 仅在停止状态允许拖动；运行/暂停态数字不可交互
    if (panelState.value !== 'ready') return;
    // 排除右键
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // 阻止默认行为，避免触摸下触发滚动/选中文字
    e.preventDefault();

    dragState.value = {
        field,
        startY: e.clientY,
        accumulated: 0,
        pointerId: e.pointerId,
    };

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.classList.add('picker-value--dragging');
    window.addEventListener('pointermove', onPickerPointerMove);
    window.addEventListener('pointerup', onPickerPointerUp, { once: true });
    window.addEventListener('pointercancel', onPickerPointerUp, { once: true });
}

function onPickerPointerMove(e: PointerEvent) {
    const state = dragState.value;
    if (!state || e.pointerId !== state.pointerId) return;
    e.preventDefault();

    const deltaPx = state.startY - e.clientY; // 向上拖为正（增大）
    // 以步长为单位累计，超出一个步长就调整一次并重置起点
    while (Math.abs(deltaPx) - state.accumulated >= DRAG_MOVE_STEP) {
        state.accumulated += DRAG_MOVE_STEP;
        adjust(state.field, +1);
    }
    while (deltaPx - state.accumulated <= -DRAG_MOVE_STEP) {
        state.accumulated -= DRAG_MOVE_STEP;
        adjust(state.field, -1);
    }
}

function onPickerPointerUp() {
    const state = dragState.value;
    if (!state) return;

    window.removeEventListener('pointermove', onPickerPointerMove);

    // 释放 pointer capture 与视觉态
    document
        .querySelectorAll('.picker-value--dragging')
        .forEach((el) => (el as HTMLElement).releasePointerCapture?.(state.pointerId));
    document.querySelectorAll('.picker-value--dragging').forEach((el) => el.classList.remove('picker-value--dragging'));

    dragState.value = null;
}

// 组件卸载兜底：避免监听器残留
onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPickerPointerMove);
    window.removeEventListener('pointerup', onPickerPointerUp);
    window.removeEventListener('pointercancel', onPickerPointerUp);
});

// ---- 启动手动灌溉 ----
const isStarting = ref(false);

async function startIrrigation() {
    if (totalDuration.value <= 0) return;
    isStarting.value = true;
    try {
        const task = await taskStore.create({
            type: 'manual',
            config: { durationSeconds: totalDuration.value } as ManualTaskConfigDto,
        });
        if (task) {
            await taskStore.startTask(task.id);
        }
    } finally {
        isStarting.value = false;
    }
}

// ---- 面板状态 ----
const panelState = computed<'ready' | 'running' | 'paused'>(() => {
    if (!taskStore.manualRunning) return 'ready';
    if (taskStore.manualPaused) return 'paused';
    return 'running';
});

// ---- 进度 ----
const progressPercent = computed(() => {
    if (taskStore.manualDuration <= 0) return 0;
    const elapsed = taskStore.manualDuration - taskStore.manualRemaining;
    return Math.round((elapsed / taskStore.manualDuration) * 100);
});

// ---- 操作 ----
function pauseIrrigation() {
    if (taskStore.manualTaskId) taskStore.pauseTask(taskStore.manualTaskId);
}

async function resumeIrrigation() {
    if (taskStore.manualTaskId) await taskStore.resumeTask(taskStore.manualTaskId);
}

async function stopIrrigation() {
    if (taskStore.manualTaskId) {
        await taskStore.stopTask(taskStore.manualTaskId);
    }
    emit('close');
}

function handleBack() {
    if (panelState.value === 'running') {
        // 简单关闭，不弹出确认（简化处理）
    }
    emit('close');
}

// ---- 面板关闭时检查倒计时是否归零 ----
watch(
    () => taskStore.manualRunning,
    (running) => {
        if (!running && props.visible) {
            emit('close');
        }
    },
);
</script>

<template>
    <div v-if="visible" class="manual-panel">
        <!-- 顶栏 -->
        <div class="manual-panel__header">
            <button class="manual-panel__back" @click="handleBack">
                <el-icon><ArrowLeft /></el-icon> 返回
            </button>
            <span class="manual-panel__title">手动灌溉</span>
            <span class="manual-panel__spacer"></span>
        </div>

        <div class="manual-panel__content">
            <!-- ==================== 停止状态 ==================== -->
            <template v-if="panelState === 'ready'">
                <!-- 虚拟滚轮时长选择器 -->
                <div class="manual-panel__picker">
                    <div class="picker-column">
                        <button class="picker-btn" @click="adjust('hours', 1)">
                            <el-icon><CaretTop /></el-icon>
                        </button>
                        <div
                            class="picker-value picker-value--draggable"
                            @pointerdown="onPickerPointerDown($event, 'hours')"
                        >
                            {{ display.hours }}
                        </div>
                        <button class="picker-btn" @click="adjust('hours', -1)">
                            <el-icon><CaretBottom /></el-icon>
                        </button>
                        <span class="picker-label">时</span>
                    </div>
                    <span class="picker-sep">:</span>
                    <div class="picker-column">
                        <button class="picker-btn" @click="adjust('minutes', 1)">
                            <el-icon><CaretTop /></el-icon>
                        </button>
                        <div
                            class="picker-value picker-value--draggable"
                            @pointerdown="onPickerPointerDown($event, 'minutes')"
                        >
                            {{ display.minutes }}
                        </div>
                        <button class="picker-btn" @click="adjust('minutes', -1)">
                            <el-icon><CaretBottom /></el-icon>
                        </button>
                        <span class="picker-label">分</span>
                    </div>
                    <span class="picker-sep">:</span>
                    <div class="picker-column">
                        <button class="picker-btn" @click="adjust('seconds', 1)">
                            <el-icon><CaretTop /></el-icon>
                        </button>
                        <div
                            class="picker-value picker-value--draggable"
                            @pointerdown="onPickerPointerDown($event, 'seconds')"
                        >
                            {{ display.seconds }}
                        </div>
                        <button class="picker-btn" @click="adjust('seconds', -1)">
                            <el-icon><CaretBottom /></el-icon>
                        </button>
                        <span class="picker-label">秒</span>
                    </div>
                </div>
                <p class="manual-panel__picker-hint">提示：触屏可上下按住拖动数字调整</p>

                <!-- 快捷预设 -->
                <div class="manual-panel__presets">
                    <button v-for="p in presets" :key="p.value" class="preset-btn" @click="applyPreset(p.value)">
                        {{ p.label }}
                    </button>
                </div>

                <!-- 信息区 -->
                <div class="manual-panel__info">
                    <div class="manual-panel__info-row">
                        <span
                            ><el-icon class="info-icon"><Odometer /></el-icon> 当前含水量:</span
                        >
                        <strong>{{
                            dataStore.latestMoisture !== null ? `${dataStore.latestMoisture}%` : 'N/A'
                        }}</strong>
                    </div>
                    <div class="manual-panel__info-row">
                        <span
                            ><el-icon class="info-icon"><Setting /></el-icon> 阀门:</span
                        >
                        <strong
                            :class="{ 'text-success': systemStore.isValveOpen, 'text-muted': !systemStore.isValveOpen }"
                        >
                            {{ systemStore.isValveOpen ? '灌溉中' : '已关闭' }}
                        </strong>
                    </div>
                </div>

                <!-- 启动按钮 -->
                <button
                    class="manual-panel__start-btn"
                    :disabled="totalDuration <= 0 || isStarting || !systemStore.espConnected"
                    @click="startIrrigation"
                >
                    {{ isStarting ? '启动中...' : '启动灌溉' }}
                </button>
            </template>

            <!-- ==================== 运行/暂停状态 ==================== -->
            <template v-else>
                <!-- 倒计时大字 -->
                <div
                    class="manual-panel__countdown"
                    :class="{ 'manual-panel__countdown--paused': panelState === 'paused' }"
                >
                    {{ taskStore.manualRemainingDisplay.hours }} : {{ taskStore.manualRemainingDisplay.minutes }} :
                    {{ taskStore.manualRemainingDisplay.seconds }}
                </div>
                <p class="manual-panel__countdown-label">剩余时间</p>

                <!-- 进度条 -->
                <div class="manual-panel__progress">
                    <div
                        class="manual-panel__progress-fill"
                        :class="{ 'manual-panel__progress-fill--paused': panelState === 'paused' }"
                        :style="{ width: `${progressPercent}%` }"
                    ></div>
                </div>
                <p class="manual-panel__progress-text">{{ progressPercent }}%</p>

                <!-- 信息区 -->
                <div class="manual-panel__info">
                    <div class="manual-panel__info-row">
                        <span
                            ><el-icon class="info-icon"><Odometer /></el-icon> 当前含水量:</span
                        >
                        <strong>{{
                            dataStore.latestMoisture !== null ? `${dataStore.latestMoisture}%` : 'N/A'
                        }}</strong>
                    </div>
                    <div class="manual-panel__info-row">
                        <span
                            ><el-icon class="info-icon"><Setting /></el-icon> 阀门:</span
                        >
                        <strong
                            :class="{ 'text-success': systemStore.isValveOpen, 'text-muted': !systemStore.isValveOpen }"
                        >
                            <template v-if="systemStore.isValveOpen">
                                <el-icon class="valve-dot"><CircleCheckFilled /></el-icon> 灌溉中
                            </template>
                            <template v-else>已关闭</template>
                        </strong>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div class="manual-panel__controls">
                    <template v-if="panelState === 'running'">
                        <button class="manual-panel__ctrl-btn" @click="pauseIrrigation">
                            <el-icon class="btn-icon"><VideoPause /></el-icon> 暂停
                        </button>
                        <button class="manual-panel__ctrl-btn manual-panel__ctrl-btn--danger" @click="stopIrrigation">
                            <el-icon class="btn-icon"><CloseBold /></el-icon> 停止
                        </button>
                    </template>
                    <template v-else>
                        <button
                            class="manual-panel__ctrl-btn manual-panel__ctrl-btn--primary"
                            @click="resumeIrrigation"
                        >
                            <el-icon class="btn-icon"><VideoPlay /></el-icon> 恢复
                        </button>
                        <button class="manual-panel__ctrl-btn manual-panel__ctrl-btn--danger" @click="stopIrrigation">
                            <el-icon class="btn-icon"><CloseBold /></el-icon> 停止
                        </button>
                    </template>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped lang="scss">
.manual-panel {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
}

.manual-panel__header {
    display: flex;
    align-items: center;
    height: 56px;
    padding: 0 var(--padding-pc);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;

    @media (max-width: 767px) {
        padding: 0 var(--padding-mobile);
    }
}

.manual-panel__back {
    background: none;
    border: none;
    color: var(--color-primary);
    font-size: var(--font-size-md);
    cursor: pointer;
    padding: var(--space-sm);
    min-width: var(--touch-min);
}

.manual-panel__title {
    flex: 1;
    text-align: center;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text);
}

.manual-panel__spacer {
    width: var(--touch-min);
}

.manual-panel__content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl) var(--padding-pc);
    gap: var(--space-lg);

    @media (max-width: 767px) {
        padding: var(--space-lg) var(--padding-mobile);
        gap: var(--space-md);
    }
}

// ---- 滚轮选择器 ----
.manual-panel__picker {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
}

.picker-column {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.picker-btn {
    width: 48px;
    height: 32px;
    border: none;
    border-radius: 4px;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast);
    user-select: none;

    &:hover {
        background: var(--color-border);
    }

    &:active {
        background: var(--color-primary-light);
        color: var(--color-primary);
    }
}

.picker-value {
    font-size: var(--font-size-xxl);
    font-weight: 700;
    color: var(--color-text);
    width: 64px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    margin: 4px 0;
    transition:
        background var(--transition-fast),
        border-color var(--transition-fast);

    // 可拖动状态（仅停止态向下能进入）
    &--draggable {
        // 允许捕获横向滑动/纵向拖拽时不被浏览器抢占用于滚动
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;

        @media (hover: hover) {
            &:hover {
                border-color: var(--color-primary);
            }
        }

        &:active {
            cursor: grabbing;
        }

        // 拖拽进行中的视觉反馈
        &.picker-value--dragging {
            cursor: grabbing;
            background: var(--color-primary-light);
            border-color: var(--color-primary);
            color: var(--color-primary);
        }
    }
}

// 拖动操作提示
.manual-panel__picker-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-sm);
    text-align: center;

    // PC 端隐藏（PC 有上下按钮足够）
    @media (hover: hover) and (pointer: fine) {
        display: none;
    }
}

.picker-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: 2px;
}

.picker-sep {
    font-size: var(--font-size-xxl);
    font-weight: 700;
    color: var(--color-text);
}

// ---- 快捷预设 ----
.manual-panel__presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    justify-content: center;
}

.preset-btn {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    background: var(--card-bg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-min);

    &:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }
}

// ---- 倒计时 ----
.manual-panel__countdown {
    font-size: 48px;
    font-weight: 700;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    letter-spacing: 4px;

    @media (max-width: 767px) {
        font-size: 36px;
    }

    &--paused {
        color: var(--color-warning);
    }
}

.manual-panel__countdown-label {
    font-size: var(--font-size-md);
    color: var(--color-text-muted);
    margin-top: calc(-1 * var(--space-md));
}

// ---- 进度条 ----
.manual-panel__progress {
    width: 100%;
    max-width: 320px;
    height: 8px;
    border-radius: 4px;
    background: var(--progress-bg);
    overflow: hidden;
}

.manual-panel__progress-fill {
    height: 100%;
    border-radius: 4px;
    background: var(--progress-fill);
    transition: width 1s linear;

    &--paused {
        background: var(--progress-fill-paused);
        transition: none;
    }
}

.manual-panel__progress-text {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: calc(-1 * var(--space-md));
}

// ---- 信息区 ----
.manual-panel__info {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--color-bg-secondary);
    border-radius: var(--card-radius);
}

.manual-panel__info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);

    strong {
        color: var(--color-text);
    }
}

.text-success {
    color: var(--color-success) !important;
}

.text-muted {
    color: var(--color-text-muted) !important;
}

// ---- 启动按钮 ----
.manual-panel__start-btn {
    width: 100%;
    max-width: 320px;
    height: 56px;
    border: none;
    border-radius: 12px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-lg);
    font-weight: 700;
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

// ---- 控制按钮 ----
.manual-panel__controls {
    display: flex;
    gap: var(--space-md);
    width: 100%;
    max-width: 320px;
}

.manual-panel__ctrl-btn {
    flex: 1;
    height: var(--touch-min);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--color-text);
    font-size: var(--font-size-md);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    &--primary {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;

        &:hover {
            opacity: 0.85;
            color: #fff;
        }
    }

    &--danger:hover {
        border-color: var(--color-danger);
        color: var(--color-danger);
    }
}

// ---- 内联图标 ----
.info-icon {
    vertical-align: -0.15em;
    margin-right: 2px;
}

.btn-icon {
    vertical-align: -0.15em;
    margin-right: 4px;
}

.valve-dot {
    color: var(--color-success);
    vertical-align: -0.15em;
    margin-right: 2px;
}
</style>
