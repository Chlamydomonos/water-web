<script setup lang="ts">
defineProps<{
    connected: boolean;
}>();
</script>

<template>
    <span class="connection-dot" :class="{ 'connection-dot--connected': connected }"></span>
</template>

<style scoped lang="scss">
.connection-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--dot-red);
    transition: background var(--transition-normal);

    &--connected {
        background: var(--dot-green);
        box-shadow: 0 0 6px var(--dot-green);
        animation: pulse-green 2s ease-in-out infinite;
    }
}

@keyframes pulse-green {
    0%,
    100% {
        box-shadow: 0 0 4px var(--dot-green);
    }
    50% {
        box-shadow: 0 0 10px var(--dot-green);
    }
}
</style>
