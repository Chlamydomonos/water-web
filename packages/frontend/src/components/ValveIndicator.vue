<script setup lang="ts">
defineProps<{
    isOpen: boolean;
}>();
</script>

<template>
    <span class="valve-indicator" :class="{ 'valve-indicator--open': isOpen }">
        {{ isOpen ? '阀门开启' : '阀门关闭' }}
    </span>
</template>

<style scoped lang="scss">
.valve-indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--valve-closed);
    transition: color var(--transition-fast);

    &::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
    }

    &--open {
        color: var(--valve-open);

        &::before {
            animation: valve-pulse 1.5s ease-in-out infinite;
        }
    }
}

@keyframes valve-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 0 var(--valve-open);
    }
    50% {
        box-shadow: 0 0 6px 2px var(--valve-open);
    }
}
</style>
