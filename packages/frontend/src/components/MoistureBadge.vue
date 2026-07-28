<script setup lang="ts">
defineProps<{
    value: number | null;
}>();
</script>

<template>
    <span class="moisture-badge">
        {{ value !== null ? `${value}%` : 'N/A' }}
    </span>
</template>

<style scoped lang="scss">
.moisture-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 24px;
    padding: 0 var(--space-sm);
    border-radius: 12px;
    font-size: var(--font-size-xs);
    font-weight: 700;
    background: var(--color-primary-light);
    color: var(--color-primary);
    white-space: nowrap;
}
</style>
