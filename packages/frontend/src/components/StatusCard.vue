<script setup lang="ts">
defineProps<{
    icon?: string;
    title: string;
    value: string | number;
    statusColor?: string;
}>();
</script>

<template>
    <div class="status-card">
        <div class="status-card__header">
            <span class="status-card__title">{{ title }}</span>
        </div>
        <div class="status-card__value">{{ value }}</div>
    </div>
</template>

<style scoped lang="scss">
.status-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--card-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--card-radius);
    box-shadow: var(--card-shadow);
    min-height: 80px;
    justify-content: center;

    @media (max-width: 767px) {
        min-height: 72px;
        padding: var(--space-sm) var(--space-md);
    }
}

.status-card__header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
}

.status-card__title {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
}

.status-card__value {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-text);

    @media (max-width: 767px) {
        font-size: var(--font-size-lg);
    }
}
</style>
