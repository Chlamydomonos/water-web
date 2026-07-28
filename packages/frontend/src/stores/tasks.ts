import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api';
import type { IrrigationTaskDto, TaskCreateRequest } from 'shared';

export const useTaskStore = defineStore('tasks', () => {
    // ---- 状态 ----
    const tasks = ref<IrrigationTaskDto[]>([]);
    const loading = ref(false);

    // ---- 手动灌溉倒计时专用状态 ----
    const manualRunning = ref(false);
    const manualTaskId = ref<number | null>(null);
    const manualDuration = ref(0);
    const manualRemaining = ref(0);
    const manualPaused = ref(false);
    let manualTimerInterval: ReturnType<typeof setInterval> | null = null;

    // ---- 计算属性 ----
    const manualTasks = computed(() => tasks.value.filter((t) => t.type === 'manual'));
    const humidityTask = computed(() => tasks.value.find((t) => t.type === 'humidity') ?? null);
    const timedTasks = computed(() => tasks.value.filter((t) => t.type === 'timed'));
    const runningTasks = computed(() => tasks.value.filter((t) => t.state === 'running'));

    const manualRemainingDisplay = computed(() => {
        const h = Math.floor(manualRemaining.value / 3600);
        const m = Math.floor((manualRemaining.value % 3600) / 60);
        const s = manualRemaining.value % 60;
        return {
            hours: String(h).padStart(2, '0'),
            minutes: String(m).padStart(2, '0'),
            seconds: String(s).padStart(2, '0'),
        };
    });

    // ---- 操作 ----
    async function fetchAll(stateFilter?: string) {
        loading.value = true;
        const res = await api.post<IrrigationTaskDto[]>('/api/tasks/list', { state: stateFilter });
        if (res.success) tasks.value = res.data;
        loading.value = false;
    }

    async function create(req: TaskCreateRequest): Promise<IrrigationTaskDto | null> {
        const res = await api.post<IrrigationTaskDto>('/api/tasks/create', req as unknown as Record<string, unknown>);
        if (res.success) {
            tasks.value.push(res.data);
            return res.data;
        }
        return null;
    }

    async function updateTask(id: number, config: unknown): Promise<IrrigationTaskDto | null> {
        const res = await api.post<IrrigationTaskDto>('/api/tasks/update', { id, config });
        if (res.success) {
            const idx = tasks.value.findIndex((t) => t.id === id);
            if (idx >= 0) tasks.value[idx] = res.data;
            return res.data;
        }
        return null;
    }

    async function removeTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/delete', { id });
        if (res.success) {
            tasks.value = tasks.value.filter((t) => t.id !== id);
            return true;
        }
        return false;
    }

    async function startTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/start', { id });
        if (res.success) {
            const task = tasks.value.find((t) => t.id === id);
            if (task && task.type === 'manual' && task.config && 'durationSeconds' in task.config) {
                startManualCountdown(id, task.config.durationSeconds);
            }
            return true;
        }
        return false;
    }

    async function stopTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/stop', { id });
        if (res.success) {
            stopManualCountdown();
            return true;
        }
        return false;
    }

    async function pauseTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/pause', { id });
        if (res.success) {
            if (id === manualTaskId.value) {
                manualPaused.value = true;
                clearManualTimer();
            }
            return true;
        }
        return false;
    }

    async function resumeTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/resume', { id });
        if (res.success) {
            if (id === manualTaskId.value) {
                manualPaused.value = false;
                startManualTimer();
            }
            return true;
        }
        return false;
    }

    async function cancelTask(id: number): Promise<boolean> {
        const res = await api.post('/api/tasks/cancel', { id });
        if (res.success) {
            if (id === manualTaskId.value) stopManualCountdown();
            return true;
        }
        return false;
    }

    // ---- 手动灌溉计时器内部逻辑 ----
    function startManualCountdown(taskId: number, durationSeconds: number) {
        manualRunning.value = true;
        manualTaskId.value = taskId;
        manualDuration.value = durationSeconds;
        manualRemaining.value = durationSeconds;
        manualPaused.value = false;
        startManualTimer();
    }

    function startManualTimer() {
        clearManualTimer();
        manualTimerInterval = setInterval(() => {
            if (manualRemaining.value <= 0) {
                stopManualCountdown();
                return;
            }
            manualRemaining.value--;
        }, 1000);
    }

    function clearManualTimer() {
        if (manualTimerInterval) {
            clearInterval(manualTimerInterval);
            manualTimerInterval = null;
        }
    }

    function stopManualCountdown() {
        clearManualTimer();
        manualRunning.value = false;
        manualTaskId.value = null;
        manualDuration.value = 0;
        manualRemaining.value = 0;
        manualPaused.value = false;
    }

    function handleTaskChanged(task: IrrigationTaskDto) {
        const idx = tasks.value.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
            tasks.value[idx] = task;
        } else {
            tasks.value.push(task);
        }
    }

    return {
        tasks,
        loading,
        manualTasks,
        humidityTask,
        timedTasks,
        runningTasks,
        manualRunning,
        manualTaskId,
        manualDuration,
        manualRemaining,
        manualPaused,
        manualRemainingDisplay,
        fetchAll,
        create,
        updateTask,
        removeTask,
        startTask,
        stopTask,
        pauseTask,
        resumeTask,
        cancelTask,
        handleTaskChanged,
    };
});
