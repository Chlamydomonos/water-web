<script setup lang="ts">
defineProps<{
    visible: boolean;
}>();
</script>

<template>
    <div v-if="visible" class="loading-overlay">
        <div class="loading-overlay__spinner"></div>
    </div>
</template>

<style scoped lang="scss">
.loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    z-index: 10;
    border-radius: var(--card-radius);
}

[data-theme='dark'] .loading-overlay {
    background: rgba(0, 0, 0, 0.4);
}

.loading-overlay__spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
