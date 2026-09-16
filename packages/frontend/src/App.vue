<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { registerSocketEvents, unregisterSocketEvents } from '@/lib/socket-init';
import { useDataStore } from '@/stores/data';

// 每秒释放到达显示时间的延迟数据，驱动图表平滑更新
let dataTickTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    registerSocketEvents();
    connectSocket();

    dataTickTimer = setInterval(() => {
        useDataStore().tick();
    }, 1000);
});

onUnmounted(() => {
    if (dataTickTimer) {
        clearInterval(dataTickTimer);
        dataTickTimer = null;
    }
    disconnectSocket();
    unregisterSocketEvents();
});
</script>

<template>
    <AppLayout />
</template>

<style lang="scss">
@use '@/styles/global.scss';
</style>
