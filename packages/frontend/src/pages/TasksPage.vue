<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElDialog, ElInputNumber, ElTimePicker, ElCheckbox, ElMessage, ElIcon } from 'element-plus';
import {
    Setting,
    Odometer,
    Clock,
    WarningFilled,
    VideoPlay,
    VideoPause,
    CloseBold,
    Edit,
    Delete,
    Close,
} from '@element-plus/icons-vue';
import { useTaskStore } from '@/stores/tasks';
import { useSystemStore } from '@/stores/system';
import { useSensorStore } from '@/stores/sensors';
import { useDataStore } from '@/stores/data';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog.vue';
import ManualIrrigationPanel from '@/pages/ManualIrrigationPanel.vue';
import type {
    IrrigationTaskDto,
    TaskType,
    TaskState,
    ManualTaskConfigDto,
    HumidityTaskConfigDto,
    TimedTaskConfigDto,
} from 'shared';

const route = useRoute();
const taskStore = useTaskStore();
const systemStore = useSystemStore();
const sensorStore = useSensorStore();
const dataStore = useDataStore();

const activeTab = ref<TaskType>('manual');

// ---- 手动灌溉面板 ----
const manualPanelVisible = ref(false);

// ---- 表单对话框 ----
const dialogVisible = ref(false);
const dialogType = ref<TaskType>('manual');
const editingTask = ref<IrrigationTaskDto | null>(null);
const formSubmitting = ref(false);

// 手动任务表单
const manualDuration = ref(300);
// 湿度任务表单
const humidityLow = ref(30);
const humidityHigh = ref(60);
// 定时任务表单
const timedStart = ref<Date | null>(null);
const timedEnd = ref<Date | null>(null);
const timedDays = ref<boolean[]>([false, false, false, false, false, false, false]);

const isEditing = computed(() => editingTask.value !== null);
const dialogTitle = computed(() => {
    if (isEditing.value) return '编辑任务';
    if (dialogType.value === 'manual') return '创建手动灌溉任务';
    if (dialogType.value === 'humidity') return '创建湿度灌溉任务';
    return '创建定时灌溉任务';
});

// 是否可以创建/启动任务
const canOperate = computed(() => !systemStore.calibrationInProgress && systemStore.espConnected);

// 湿度任务是否已存在
const humidityTaskExists = computed(() => taskStore.humidityTask !== null);

// 当前 tab 任务列表
const currentTasks = computed(() => {
    if (activeTab.value === 'manual') return taskStore.manualTasks;
    if (activeTab.value === 'humidity') return taskStore.humidityTask ? [taskStore.humidityTask] : [];
    return taskStore.timedTasks;
});

// 当前含水量
const currentMoisture = computed(() => dataStore.latestMoisture);
const allSensorsFaulty = computed(() => sensorStore.sensors.length > 0 && sensorStore.healthySensors.length === 0);

// 星期标签
const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ============================================================
// Tab 切换
// ============================================================
function switchTab(type: TaskType) {
    activeTab.value = type;
}

// ============================================================
// 表单操作
// ============================================================
function openCreateDialog(type: TaskType) {
    editingTask.value = null;
    dialogType.value = type;
    // 重置表单
    manualDuration.value = 300;
    humidityLow.value = 30;
    humidityHigh.value = 60;
    timedStart.value = null;
    timedEnd.value = null;
    timedDays.value = [false, false, false, false, false, false, false];
    dialogVisible.value = true;
}

function openEditDialog(task: IrrigationTaskDto) {
    editingTask.value = task;
    dialogType.value = task.type;
    if (task.config) {
        if (task.type === 'manual') {
            manualDuration.value = (task.config as ManualTaskConfigDto).durationSeconds;
        } else if (task.type === 'humidity') {
            humidityLow.value = (task.config as HumidityTaskConfigDto).lowThreshold;
            humidityHigh.value = (task.config as HumidityTaskConfigDto).highThreshold;
        } else if (task.type === 'timed') {
            const tc = task.config as TimedTaskConfigDto;
            const [sh, sm] = tc.startTime.split(':').map(Number);
            const [eh, em] = tc.endTime.split(':').map(Number);
            const today = new Date();
            timedStart.value = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
            timedEnd.value = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
            timedDays.value = Array.from({ length: 7 }, (_, i) => tc.daysOfWeek.includes(i));
        }
    }
    dialogVisible.value = true;
}

async function submitForm() {
    formSubmitting.value = true;
    try {
        let config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto;
        if (dialogType.value === 'manual') {
            config = { durationSeconds: manualDuration.value };
        } else if (dialogType.value === 'humidity') {
            if (humidityHigh.value <= humidityLow.value) {
                ElMessage.warning('停止阈值必须大于启动阈值');
                return;
            }
            config = { lowThreshold: humidityLow.value, highThreshold: humidityHigh.value };
        } else {
            if (!timedStart.value || !timedEnd.value) {
                ElMessage.warning('请选择开始和结束时间');
                return;
            }
            const hhmm = (d: Date) =>
                `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const days = timedDays.value.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
            if (days.length === 0) {
                ElMessage.warning('请至少选择一个重复日');
                return;
            }
            config = {
                startTime: hhmm(timedStart.value),
                endTime: hhmm(timedEnd.value),
                daysOfWeek: days,
            };
        }

        if (isEditing.value) {
            await taskStore.updateTask(editingTask.value!.id, config);
            ElMessage.success('任务已更新');
        } else {
            await taskStore.create({ type: dialogType.value, config });
            ElMessage.success('任务已创建');
        }
        dialogVisible.value = false;
    } finally {
        formSubmitting.value = false;
    }
}

// ============================================================
// 任务操作
// ============================================================
async function startManualTask(task: IrrigationTaskDto) {
    const ok = await taskStore.startTask(task.id);
    if (ok) {
        manualPanelVisible.value = true;
    }
}

async function pauseTask(task: IrrigationTaskDto) {
    const ok = await taskStore.pauseTask(task.id);
    if (ok) ElMessage.success('任务已暂停');
}

async function resumeTask(task: IrrigationTaskDto) {
    const ok = await taskStore.resumeTask(task.id);
    if (ok) ElMessage.success('任务已恢复');
}

async function stopTask(task: IrrigationTaskDto) {
    const ok = await taskStore.stopTask(task.id);
    if (ok) {
        ElMessage.success('任务已停止');
        manualPanelVisible.value = false;
    }
}

async function cancelTask(task: IrrigationTaskDto) {
    const ok = await taskStore.cancelTask(task.id);
    if (ok) ElMessage.success('任务已取消');
}

// ---- 删除 ----
const deleteTarget = ref<IrrigationTaskDto | null>(null);

function confirmDelete(task: IrrigationTaskDto) {
    deleteTarget.value = task;
}

async function doDelete() {
    if (!deleteTarget.value) return;
    const ok = await taskStore.removeTask(deleteTarget.value.id);
    deleteTarget.value = null;
    if (ok) ElMessage.success('任务已删除');
    else ElMessage.error('删除失败');
}

// ============================================================
// 状态徽章
// ============================================================
function statusLabel(state: TaskState) {
    const map: Record<TaskState, string> = {
        idle: '就绪',
        running: '运行中',
        paused: '已暂停',
        blocked: '阻塞中',
        completed: '已完成',
        cancelled: '已取消',
    };
    return map[state];
}

function statusClass(state: TaskState) {
    return `task-badge--${state}`;
}

// ============================================================
// 配置摘要
// ============================================================
function configSummary(task: IrrigationTaskDto) {
    if (!task.config) return '';
    if (task.type === 'manual') {
        const secs = (task.config as ManualTaskConfigDto).durationSeconds;
        if (secs >= 60) return `时长 ${Math.floor(secs / 60)} 分钟`;
        return `时长 ${secs} 秒`;
    }
    if (task.type === 'humidity') {
        const hc = task.config as HumidityTaskConfigDto;
        return `阈值 ${hc.lowThreshold}% → ${hc.highThreshold}%`;
    }
    if (task.type === 'timed') {
        const tc = task.config as TimedTaskConfigDto;
        const dayNames = tc.daysOfWeek.map((d) => dayLabels[d]).join('、');
        return `每天 ${tc.startTime}-${tc.endTime} ${dayNames}`;
    }
    return '';
}

// ============================================================
// 初始化
// ============================================================
onMounted(() => {
    if (route.query.action === 'manual') {
        activeTab.value = 'manual';
        manualPanelVisible.value = true;
    }
});
</script>

<template>
    <div class="tasks-page">
        <div class="tasks-page__header">
            <h2>任务管理</h2>
            <button class="tasks-page__add-btn" :disabled="!canOperate" @click="openCreateDialog(activeTab)">
                + 创建任务
            </button>
        </div>

        <!-- 校准横幅 -->
        <div v-if="systemStore.calibrationInProgress" class="tasks-page__calibration-notice">
            <el-icon class="notice-icon"><Setting /></el-icon>
            传感器「{{
                sensorStore.sensors.find((s) => s.id === systemStore.calibratingSensorId)?.name ?? '未知'
            }}」正在校准，创建和启动任务暂时禁用
        </div>

        <!-- Tab 切换 -->
        <div class="tasks-page__tabs">
            <button
                v-for="tab in ['manual', 'humidity', 'timed'] as const"
                :key="tab"
                class="tasks-page__tab"
                :class="{ 'tasks-page__tab--active': activeTab === tab }"
                @click="switchTab(tab)"
            >
                {{ tab === 'manual' ? '手动灌溉' : tab === 'humidity' ? '湿度任务' : '定时任务' }}
            </button>
        </div>

        <!-- 任务卡片列表 -->
        <div class="tasks-page__list">
            <EmptyState
                v-if="currentTasks.length === 0"
                :message="activeTab === 'humidity' && humidityTaskExists ? '' : '暂无任务，创建一个灌溉任务吧'"
                action-label="创建任务"
                @action="openCreateDialog(activeTab)"
            />

            <div v-for="task in currentTasks" :key="task.id" class="task-card">
                <div class="task-card__header">
                    <span class="task-card__type-icon">
                        <el-icon v-if="task.type === 'manual'"><Setting /></el-icon>
                        <el-icon v-else-if="task.type === 'humidity'"><Odometer /></el-icon>
                        <el-icon v-else><Clock /></el-icon>
                    </span>
                    <span class="task-card__type-label">
                        {{ activeTab === 'manual' ? '手动灌溉' : activeTab === 'humidity' ? '湿度灌溉' : '定时灌溉' }}
                    </span>
                    <span class="task-badge" :class="statusClass(task.state)">
                        {{ statusLabel(task.state) }}
                    </span>
                </div>

                <div class="task-card__body">
                    <p class="task-card__summary">{{ configSummary(task) }}</p>

                    <!-- 湿度任务显示当前含水量 -->
                    <p v-if="task.type === 'humidity'" class="task-card__moisture">
                        当前含水量:
                        <span v-if="allSensorsFaulty" class="task-card__moisture--na">N/A — 传感器全部故障</span>
                        <template v-else>
                            {{ currentMoisture !== null ? `${currentMoisture}%` : '等待数据...' }}
                        </template>
                    </p>

                    <!-- 阻塞原因 -->
                    <p v-if="task.state === 'blocked'" class="task-card__blocked-reason">
                        <el-icon class="inline-icon"><WarningFilled /></el-icon>
                        被{{ task.suspendedByTaskId ? '其他' : '高优先级' }}任务阻塞
                    </p>

                    <!-- 创建时间 -->
                    <p class="task-card__time">创建: {{ new Date(task.createdAt).toLocaleString('zh-CN') }}</p>
                </div>

                <div class="task-card__actions">
                    <!-- idle 状态 -->
                    <template v-if="task.state === 'idle'">
                        <button
                            v-if="task.type === 'manual'"
                            class="task-card__btn task-card__btn--primary"
                            :disabled="!canOperate"
                            @click="startManualTask(task)"
                        >
                            <el-icon class="btn-icon"><VideoPlay /></el-icon> 启动
                        </button>
                        <button class="task-card__btn" @click="openEditDialog(task)">
                            <el-icon class="btn-icon"><Edit /></el-icon> 编辑
                        </button>
                        <button class="task-card__btn task-card__btn--danger" @click="confirmDelete(task)">
                            <el-icon class="btn-icon"><Delete /></el-icon> 删除
                        </button>
                    </template>

                    <!-- running 状态 -->
                    <template v-if="task.state === 'running'">
                        <button v-if="task.type === 'manual'" class="task-card__btn" @click="pauseTask(task)">
                            <el-icon class="btn-icon"><VideoPause /></el-icon> 暂停
                        </button>
                        <button
                            v-if="task.type === 'manual'"
                            class="task-card__btn task-card__btn--danger"
                            @click="stopTask(task)"
                        >
                            <el-icon class="btn-icon"><CloseBold /></el-icon> 停止
                        </button>
                        <button
                            v-if="task.type !== 'manual'"
                            class="task-card__btn task-card__btn--danger"
                            @click="cancelTask(task)"
                        >
                            <el-icon class="btn-icon"><Close /></el-icon> 取消
                        </button>
                    </template>

                    <!-- paused 状态 -->
                    <template v-if="task.state === 'paused'">
                        <button
                            class="task-card__btn task-card__btn--primary"
                            :disabled="!canOperate"
                            @click="resumeTask(task)"
                        >
                            <el-icon class="btn-icon"><VideoPlay /></el-icon> 恢复
                        </button>
                        <button class="task-card__btn task-card__btn--danger" @click="cancelTask(task)">
                            <el-icon class="btn-icon"><Close /></el-icon> 取消
                        </button>
                    </template>

                    <!-- blocked 状态 -->
                    <template v-if="task.state === 'blocked'">
                        <button class="task-card__btn" @click="openEditDialog(task)">
                            <el-icon class="btn-icon"><Edit /></el-icon> 编辑
                        </button>
                        <button class="task-card__btn task-card__btn--danger" @click="confirmDelete(task)">
                            <el-icon class="btn-icon"><Delete /></el-icon> 删除
                        </button>
                    </template>

                    <!-- completed / cancelled 状态 -->
                    <template v-if="task.state === 'completed' || task.state === 'cancelled'">
                        <button class="task-card__btn task-card__btn--danger" @click="confirmDelete(task)">
                            <el-icon class="btn-icon"><Delete /></el-icon> 删除
                        </button>
                    </template>
                </div>
            </div>
        </div>

        <!-- 创建/编辑对话框 -->
        <ElDialog v-model="dialogVisible" :title="dialogTitle" width="440px" destroy-on-close>
            <div class="tasks-page__form">
                <!-- 手动任务 -->
                <template v-if="dialogType === 'manual'">
                    <label class="tasks-page__form-label">灌溉时长 (秒)</label>
                    <ElInputNumber v-model="manualDuration" :min="1" :max="3600" style="width: 100%" />
                    <span class="tasks-page__form-hint">1 ~ 3600 秒</span>
                </template>

                <!-- 湿度任务 -->
                <template v-if="dialogType === 'humidity'">
                    <label class="tasks-page__form-label">启动阈值 (%)</label>
                    <ElInputNumber v-model="humidityLow" :min="0" :max="100" style="width: 100%" />
                    <span class="tasks-page__form-hint">含水量低于此值时自动灌溉</span>

                    <label class="tasks-page__form-label">停止阈值 (%)</label>
                    <ElInputNumber v-model="humidityHigh" :min="0" :max="100" style="width: 100%" />
                    <span class="tasks-page__form-hint">含水量高于此值时停止灌溉（必须大于启动阈值）</span>
                </template>

                <!-- 定时任务 -->
                <template v-if="dialogType === 'timed'">
                    <label class="tasks-page__form-label">开始时间</label>
                    <ElTimePicker v-model="timedStart" format="HH:mm" value-format="HH:mm" style="width: 100%" />

                    <label class="tasks-page__form-label">结束时间</label>
                    <ElTimePicker v-model="timedEnd" format="HH:mm" value-format="HH:mm" style="width: 100%" />

                    <label class="tasks-page__form-label">重复日</label>
                    <div class="tasks-page__day-grid">
                        <ElCheckbox v-for="(label, i) in dayLabels" :key="i" v-model="timedDays[i]" :label="label" />
                    </div>
                </template>

                <div class="tasks-page__form-actions">
                    <button class="tasks-page__form-cancel" @click="dialogVisible = false">取消</button>
                    <button class="tasks-page__form-submit" :disabled="formSubmitting" @click="submitForm">
                        {{ formSubmitting ? '提交中...' : isEditing ? '保存' : '创建' }}
                    </button>
                </div>
            </div>
        </ElDialog>

        <!-- 删除确认 -->
        <ConfirmDeleteDialog
            :visible="deleteTarget !== null"
            :message="`确定要删除此任务吗？`"
            @confirm="doDelete"
            @cancel="deleteTarget = null"
        />

        <!-- 手动灌溉面板 -->
        <ManualIrrigationPanel :visible="manualPanelVisible" @close="manualPanelVisible = false" />

        <!-- 移动端快捷操作栏 -->
        <div class="quick-action-bar hide-on-pc">
            <button
                class="quick-action-bar__btn"
                :disabled="!systemStore.espConnected"
                @click="manualPanelVisible = true"
            >
                <el-icon class="btn-icon"><VideoPlay /></el-icon> 手动灌溉
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.tasks-page {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--padding-pc);

    @media (max-width: 767px) {
        padding: var(--padding-mobile);
        padding-bottom: 80px; // 为移动端快捷操作栏留空间
    }
}

.tasks-page__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);

    h2 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
    }
}

.tasks-page__add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-lg);
    border: none;
    border-radius: 6px;
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

// ---- 校准通知 ----
.tasks-page__calibration-notice {
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
    border-radius: 6px;
    background: var(--banner-bg-info);
    color: var(--banner-text-info);
    font-size: var(--font-size-sm);
}

// ---- Tab 切换 ----
.tasks-page__tabs {
    display: flex;
    gap: var(--space-xs);
    margin-bottom: var(--space-lg);
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0;
}

.tasks-page__tab {
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-min);

    &:hover {
        color: var(--color-text);
    }

    &--active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
        font-weight: 600;
    }
}

// ---- 任务卡片 ----
.tasks-page__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
}

.task-card {
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    padding: var(--space-md);
    box-shadow: var(--card-shadow);
}

.task-card__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
}

.task-card__type-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    font-size: 16px;
}

.task-card__type-label {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
}

// ---- 状态徽章 ----
.task-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-sm);
    border-radius: 11px;
    font-size: var(--font-size-xs);
    font-weight: 600;

    &--idle {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
    }
    &--running {
        background: var(--color-success-light);
        color: var(--color-success);
    }
    &--paused {
        background: var(--color-warning-light);
        color: var(--color-warning);
    }
    &--blocked {
        background: var(--color-danger-light);
        color: var(--color-danger);
    }
    &--completed {
        background: var(--color-info-light);
        color: var(--color-info);
    }
    &--cancelled {
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
    }
}

.task-card__body {
    margin-bottom: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.task-card__summary {
    font-size: var(--font-size-md);
    color: var(--color-text);
}

.task-card__moisture {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
}

.task-card__moisture--na {
    color: var(--color-danger);
}

.task-card__blocked-reason {
    font-size: var(--font-size-sm);
    color: var(--color-warning);
}

.task-card__time {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

.task-card__actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
}

.task-card__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover:not(:disabled) {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;

        &:hover:not(:disabled) {
            opacity: 0.85;
            color: #fff;
        }
    }

    &--danger:hover:not(:disabled) {
        border-color: var(--color-danger);
        color: var(--color-danger);
    }
}

// ---- 表单 ----
.tasks-page__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}

.tasks-page__form-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-top: var(--space-sm);
}

.tasks-page__form-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

.tasks-page__day-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-md);
}

.tasks-page__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-md);
}

.tasks-page__form-cancel {
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: var(--font-size-md);
    cursor: pointer;

    &:hover {
        background: var(--color-bg-secondary);
    }
}

.tasks-page__form-submit {
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-md);
    border: none;
    border-radius: 6px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-md);
    cursor: pointer;

    &:hover:not(:disabled) {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

// ---- 内联图标 ----
.notice-icon {
    vertical-align: -0.15em;
    margin-right: 4px;
}

.inline-icon {
    vertical-align: -0.15em;
    margin-right: 2px;
}

.btn-icon {
    vertical-align: -0.15em;
    margin-right: 4px;
}
// ============================================================
// 移动端快捷操作栏 (与 DashboardPage 样式保持一致)
// ============================================================
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

.btn-icon {
    vertical-align: -0.15em;
    margin-right: 4px;
}
</style>
