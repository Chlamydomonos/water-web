<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { registerSocketEvents, unregisterSocketEvents } from '@/lib/socket-init';

onMounted(() => {
    registerSocketEvents();
    connectSocket();
});

onUnmounted(() => {
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
