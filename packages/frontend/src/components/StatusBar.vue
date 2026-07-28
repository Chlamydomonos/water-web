<script setup lang="ts">
import { useSystemStore } from '@/stores/system';
import EspDisconnectedBanner from '@/components/EspDisconnectedBanner.vue';
import SocketDisconnectedBanner from '@/components/SocketDisconnectedBanner.vue';
import CalibrationBanner from '@/components/CalibrationBanner.vue';

const systemStore = useSystemStore();
</script>

<template>
    <div class="status-bar">
        <CalibrationBanner v-if="systemStore.calibrationInProgress" />
        <SocketDisconnectedBanner v-else-if="systemStore.showSocketDisconnected" />
        <EspDisconnectedBanner v-else-if="systemStore.showEspDisconnected" />
    </div>
</template>

<style scoped lang="scss">
.status-bar {
    flex-shrink: 0;

    > * {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 var(--padding-pc);
        font-size: var(--font-size-sm);

        @media (max-width: 767px) {
            padding: 0 var(--padding-mobile);
            font-size: var(--font-size-xs);
        }
    }
}
</style>
