import { socket } from './socket';
import { useSystemStore } from '@/stores/system';
import { useSensorStore } from '@/stores/sensors';
import { useTaskStore } from '@/stores/tasks';
import { useDataStore } from '@/stores/data';

export function registerSocketEvents() {
    // ---- 连接/重连 ----
    socket.on('connect', () => {
        useSystemStore().handleSocketConnected();
        useSystemStore().fetchStatus();
        useSensorStore().fetchAll();
        useTaskStore().fetchAll();
        useDataStore().fetchLatest();
    });

    socket.on('disconnect', () => {
        useSystemStore().handleSocketDisconnected();
    });

    // 连接尝试失败（含后端不可达/CORS 被拒等）。首次连接若一直失败，
    // socket.io 永远不会触发 disconnect，必须在此处理，否则 banner 不显示。
    socket.on('connect_error', () => {
        useSystemStore().handleSocketDisconnected();
    });

    // ---- system 事件 ----
    socket.on('system:esp_connected', (data: { timestamp: number }) => {
        useSystemStore().handleEspConnected(data.timestamp);
    });

    socket.on('system:esp_disconnected', (data: { timestamp: number }) => {
        useSystemStore().handleEspDisconnected(data.timestamp);
    });

    // ---- valve 事件 ----
    socket.on('valve:changed', (data: { state: 0 | 1; triggeredBy: string }) => {
        useSystemStore().handleValveChanged(data);
    });

    // ---- calibration 事件 ----
    socket.on('calibration:started', (data: { sensorId: number }) => {
        useSystemStore().handleCalibrationStarted(data.sensorId);
    });

    socket.on('calibration:stopped', () => {
        useSystemStore().handleCalibrationStopped();
    });

    // ---- sensor 事件 ----
    socket.on('sensor:changed', (data) => {
        useSensorStore().handleSensorChanged(data);
    });

    // ---- task 事件 ----
    socket.on('task:changed', (data) => {
        useTaskStore().handleTaskChanged(data);
    });

    // ---- data 事件 ----
    socket.on('data:new', (data) => {
        useDataStore().pushSnapshot(data);
    });
}

export function unregisterSocketEvents() {
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('system:esp_connected');
    socket.off('system:esp_disconnected');
    socket.off('valve:changed');
    socket.off('calibration:started');
    socket.off('calibration:stopped');
    socket.off('sensor:changed');
    socket.off('task:changed');
    socket.off('data:new');
}
