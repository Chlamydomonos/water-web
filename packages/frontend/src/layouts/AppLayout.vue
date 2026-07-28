<script setup lang="ts">
import TopBar from '@/components/TopBar.vue';
import StatusBar from '@/components/StatusBar.vue';
</script>

<template>
    <div class="app-layout">
        <TopBar />
        <StatusBar />
        <main class="app-content">
            <router-view />
        </main>
    </div>
</template>

<style scoped lang="scss">
.app-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
}

.app-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}
</style>
