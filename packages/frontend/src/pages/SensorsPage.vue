<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElTable, ElTableColumn, ElDialog, ElSelect, ElOption, ElInput, ElMessage } from 'element-plus';
import { useSensorStore } from '@/stores/sensors';
import EmptyState from '@/components/EmptyState.vue';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog.vue';
import type { SensorDto } from 'shared';

const router = useRouter();
const sensorStore = useSensorStore();

// ---- 表单对话框 ----
const dialogVisible = ref(false);
const editingSensor = ref<SensorDto | null>(null);
const formName = ref('');
const formAddr = ref<number>(0);
const formSubmitting = ref(false);

const isEditing = computed(() => editingSensor.value !== null);
const dialogTitle = computed(() => (isEditing.value ? '编辑传感器' : '添加传感器'));

// 已占用地址
const occupiedAddrs = computed(() => {
    const set = new Set<number>();
    sensorStore.sensors.forEach((s) => {
        if (!editingSensor.value || s.id !== editingSensor.value.id) {
            set.add(s.slaveAddr);
        }
    });
    return set;
});

const addrOptions = computed(() =>
    Array.from({ length: 16 }, (_, i) => ({
        value: i,
        label: `#${i}`,
        disabled: occupiedAddrs.value.has(i),
    })),
);

function openCreateDialog() {
    editingSensor.value = null;
    formName.value = '';
    formAddr.value = 0;
    // 默认选第一个未占用的地址
    const free = Array.from({ length: 16 }, (_, i) => i).find((i) => !occupiedAddrs.value.has(i));
    if (free !== undefined) formAddr.value = free;
    dialogVisible.value = true;
}

function openEditDialog(sensor: SensorDto) {
    editingSensor.value = sensor;
    formName.value = sensor.name;
    formAddr.value = sensor.slaveAddr;
    dialogVisible.value = true;
}

async function submitForm() {
    const name = formName.value.trim();
    if (!name) {
        ElMessage.warning('请输入传感器名称');
        return;
    }
    formSubmitting.value = true;
    try {
        if (isEditing.value) {
            await sensorStore.update({ id: editingSensor.value!.id, name });
        } else {
            await sensorStore.create({ slaveAddr: formAddr.value, name });
        }
        dialogVisible.value = false;
        ElMessage.success(isEditing.value ? '传感器已更新' : '传感器已添加');
    } finally {
        formSubmitting.value = false;
    }
}

// ---- 删除 ----
const deleteTarget = ref<SensorDto | null>(null);

function confirmDelete(sensor: SensorDto) {
    deleteTarget.value = sensor;
}

async function doDelete() {
    if (!deleteTarget.value) return;
    const ok = await sensorStore.remove(deleteTarget.value.id);
    deleteTarget.value = null;
    if (ok) ElMessage.success('传感器已删除');
    else ElMessage.error('删除失败');
}

// ---- 故障切换 ----
async function toggleFaulty(sensor: SensorDto) {
    await sensorStore.update({ id: sensor.id, faulty: !sensor.faulty });
}

// ---- 校准导航 ----
function goToCalibration(sensorId: number) {
    router.push(`/sensors/${sensorId}/calibration`);
}
</script>

<template>
    <div class="sensors-page">
        <div class="sensors-page__header">
            <h2>传感器管理</h2>
            <button class="sensors-page__add-btn" @click="openCreateDialog">+ 添加传感器</button>
        </div>

        <EmptyState
            v-if="sensorStore.sensors.length === 0"
            message="暂无传感器，请先添加"
            action-label="添加第一个传感器"
            @action="openCreateDialog"
        />
        <div v-else class="sensors-page__table">
            <ElTable :data="sensorStore.sensors" style="width: 100%" row-key="id">
                <ElTableColumn prop="name" label="名称" min-width="120" />
                <ElTableColumn label="地址" width="80">
                    <template #default="{ row }"> #{{ (row as SensorDto).slaveAddr }} </template>
                </ElTableColumn>
                <ElTableColumn label="故障" width="100" align="center">
                    <template #default="{ row }">
                        <input
                            type="checkbox"
                            class="sensors-page__faulty-toggle"
                            :checked="(row as SensorDto).faulty"
                            @change="toggleFaulty(row as SensorDto)"
                        />
                    </template>
                </ElTableColumn>
                <ElTableColumn label="校准" width="140">
                    <template #default="{ row }">
                        <span v-if="(row as SensorDto).calibrated" class="sensors-page__calib-done"> ✅ 已校准 </span>
                        <button v-else class="sensors-page__calib-btn" @click="goToCalibration((row as SensorDto).id)">
                            进入校准
                        </button>
                    </template>
                </ElTableColumn>
                <ElTableColumn label="操作" width="160">
                    <template #default="{ row }">
                        <div class="sensors-page__actions">
                            <button class="sensors-page__action-btn" @click="openEditDialog(row as SensorDto)">
                                编辑
                            </button>
                            <button
                                class="sensors-page__action-btn sensors-page__action-btn--danger"
                                @click="confirmDelete(row as SensorDto)"
                            >
                                删除
                            </button>
                        </div>
                    </template>
                </ElTableColumn>
            </ElTable>
        </div>

        <!-- 添加/编辑对话框 -->
        <ElDialog v-model="dialogVisible" :title="dialogTitle" width="400px" destroy-on-close>
            <div class="sensors-page__form">
                <label class="sensors-page__form-label">名称</label>
                <ElInput v-model="formName" placeholder="例如: 1号花盆" maxlength="20" />

                <label class="sensors-page__form-label">地址</label>
                <ElSelect v-model="formAddr" :disabled="isEditing" style="width: 100%">
                    <ElOption
                        v-for="opt in addrOptions"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                        :disabled="opt.disabled"
                    />
                </ElSelect>

                <div class="sensors-page__form-actions">
                    <button class="sensors-page__form-cancel" @click="dialogVisible = false">取消</button>
                    <button class="sensors-page__form-submit" :disabled="formSubmitting" @click="submitForm">
                        {{ formSubmitting ? '提交中...' : '确定' }}
                    </button>
                </div>
            </div>
        </ElDialog>

        <!-- 删除确认 -->
        <ConfirmDeleteDialog
            :visible="deleteTarget !== null"
            :message="`确定要删除传感器「${deleteTarget?.name ?? ''}」吗？已采集的历史数据将保留。`"
            @confirm="doDelete"
            @cancel="deleteTarget = null"
        />
    </div>
</template>

<style scoped lang="scss">
.sensors-page {
    max-width: var(--content-max-width);
    margin: 0 auto;
    padding: var(--padding-pc);

    @media (max-width: 767px) {
        padding: var(--padding-mobile);
    }
}

.sensors-page__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-lg);

    h2 {
        font-size: var(--font-size-xl);
        font-weight: 700;
        color: var(--color-text);
    }
}

.sensors-page__add-btn {
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

    &:hover {
        opacity: 0.85;
    }
}

.sensors-page__table {
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    overflow: hidden;
}

.sensors-page__faulty-toggle {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--color-danger);
}

.sensors-page__calib-done {
    font-size: var(--font-size-sm);
    color: var(--color-success);
}

.sensors-page__calib-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 0 var(--space-sm);
    border: 1px solid var(--color-primary);
    border-radius: 4px;
    background: transparent;
    color: var(--color-primary);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
        background: var(--color-primary);
        color: #fff;
    }
}

.sensors-page__actions {
    display: flex;
    gap: var(--space-sm);
}

.sensors-page__action-btn {
    padding: 4px var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: border-color var(--transition-fast);

    &:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
    }

    &--danger:hover {
        border-color: var(--color-danger);
        color: var(--color-danger);
    }
}

// ---- 表单 ----
.sensors-page__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
}

.sensors-page__form-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
}

.sensors-page__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
}

.sensors-page__form-cancel {
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

.sensors-page__form-submit {
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
</style>
