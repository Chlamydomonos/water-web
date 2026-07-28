import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api';

export const useSystemStore = defineStore('system', () => {
    // ---- 状态 ----
    const socketConnected = ref<boolean>(false);
    const espConnected = ref<boolean>(false);
    const espLastSeen = ref<number | null>(null);
    const valveState = ref<0 | 1>(0);
    const activeTaskCount = ref(0);
    const calibrationInProgress = ref(false);
    const calibratingSensorId = ref<number | null>(null);
    const lastCollectionTime = ref<string | null>(null);

    // ---- 横幅延迟显示 (避免连接建立过程中短暂闪烁) ----
    const SOCKET_BANNER_DELAY = 3_000; // WebSocket 断开 3s 后才显示横幅
    const ESP_BANNER_DELAY = 5_000; // ESP32 断开 5s 后才显示横幅

    const showSocketDisconnected = ref(false);
    const showEspDisconnected = ref(false);
    let socketBannerTimer: ReturnType<typeof setTimeout> | null = null;
    let espBannerTimer: ReturnType<typeof setTimeout> | null = null;

    function clearSocketBannerTimer() {
        if (socketBannerTimer) {
            clearTimeout(socketBannerTimer);
            socketBannerTimer = null;
        }
    }

    function clearEspBannerTimer() {
        if (espBannerTimer) {
            clearTimeout(espBannerTimer);
            espBannerTimer = null;
        }
    }

    // ---- 计算属性 ----
    const isValveOpen = computed(() => valveState.value === 1);
    const espStatusText = computed(() => (espConnected.value ? '已连接' : '未连接'));

    // ---- 操作 ----
    async function fetchStatus() {
        const res = await api.post<{
            espConnected: boolean;
            valveState: 0 | 1;
            activeTaskCount: number;
            calibrationInProgress: boolean;
            lastCollectionTime: string | null;
        }>('/api/system/status');
        if (res.success) {
            espConnected.value = res.data.espConnected;
            valveState.value = res.data.valveState;
            activeTaskCount.value = res.data.activeTaskCount;
            calibrationInProgress.value = res.data.calibrationInProgress;
            lastCollectionTime.value = res.data.lastCollectionTime;
        }
    }

    function handleEspConnected(timestamp: number) {
        espConnected.value = true;
        espLastSeen.value = timestamp;
        clearEspBannerTimer();
        showEspDisconnected.value = false;
    }

    function handleEspDisconnected(timestamp: number) {
        espConnected.value = false;
        espLastSeen.value = timestamp;
        clearEspBannerTimer();
        espBannerTimer = setTimeout(() => {
            showEspDisconnected.value = true;
        }, ESP_BANNER_DELAY);
    }

    function handleValveChanged(event: { state: 0 | 1; triggeredBy: string }) {
        valveState.value = event.state;
    }

    function handleCalibrationStarted(sensorId: number) {
        calibrationInProgress.value = true;
        calibratingSensorId.value = sensorId;
    }

    function handleCalibrationStopped() {
        calibrationInProgress.value = false;
        calibratingSensorId.value = null;
    }

    function handleSocketConnected() {
        socketConnected.value = true;
        clearSocketBannerTimer();
        showSocketDisconnected.value = false;
    }

    function handleSocketDisconnected() {
        socketConnected.value = false;
        clearSocketBannerTimer();
        socketBannerTimer = setTimeout(() => {
            showSocketDisconnected.value = true;
        }, SOCKET_BANNER_DELAY);
    }

    return {
        socketConnected,
        espConnected,
        espLastSeen,
        valveState,
        activeTaskCount,
        calibrationInProgress,
        calibratingSensorId,
        lastCollectionTime,
        showSocketDisconnected,
        showEspDisconnected,
        isValveOpen,
        espStatusText,
        fetchStatus,
        handleEspConnected,
        handleEspDisconnected,
        handleValveChanged,
        handleCalibrationStarted,
        handleCalibrationStopped,
        handleSocketConnected,
        handleSocketDisconnected,
    };
});
