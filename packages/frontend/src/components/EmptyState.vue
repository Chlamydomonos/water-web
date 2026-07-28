<script setup lang="ts">
defineProps<{
    icon?: string;
    message: string;
    actionLabel?: string;
}>();

defineEmits<{
    action: [];
}>();
</script>

<template>
    <div class="empty-state">
        <div class="empty-state__icon"></div>
        <p class="empty-state__message">{{ message }}</p>
        <button v-if="actionLabel" class="empty-state__action" @click="$emit('action')">
            {{ actionLabel }}
        </button>
    </div>
</template>

<style scoped lang="scss">
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl) var(--space-md);
    text-align: center;
    gap: var(--space-md);
}

.empty-state__icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--color-bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: var(--color-text-muted);
}

.empty-state__message {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    max-width: 280px;
    line-height: 1.5;
}

.empty-state__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-lg);
    border: none;
    border-radius: 6px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: opacity var(--transition-fast);

    &:hover {
        opacity: 0.85;
    }
}
</style>
