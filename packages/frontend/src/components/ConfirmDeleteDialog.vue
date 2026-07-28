<script setup lang="ts">
defineProps<{
    visible: boolean;
    title?: string;
    message?: string;
}>();

defineEmits<{
    confirm: [];
    cancel: [];
}>();
</script>

<template>
    <div v-if="visible" class="confirm-delete-overlay">
        <div class="confirm-delete-dialog">
            <h3>{{ title ?? '确认删除' }}</h3>
            <p>{{ message ?? '此操作不可撤销，确定继续？' }}</p>
            <div class="confirm-delete-dialog__actions">
                <button @click="$emit('cancel')">取消</button>
                <button class="confirm-delete-dialog__danger" @click="$emit('confirm')">删除</button>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.confirm-delete-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    z-index: 100;
}

.confirm-delete-dialog {
    background: var(--card-bg);
    border-radius: var(--card-radius);
    padding: var(--space-lg);
    width: 90%;
    max-width: 360px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);

    h3 {
        font-size: var(--font-size-lg);
        color: var(--color-text);
        margin-bottom: var(--space-sm);
    }

    p {
        font-size: var(--font-size-md);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-lg);
        line-height: 1.5;
    }
}

.confirm-delete-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);

    button {
        min-width: var(--touch-min);
        height: var(--touch-min);
        padding: 0 var(--space-md);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-bg);
        color: var(--color-text);
        font-size: var(--font-size-md);
        cursor: pointer;
        transition: background var(--transition-fast);

        &:hover {
            background: var(--color-bg-secondary);
        }
    }
}

.confirm-delete-dialog__danger {
    border-color: var(--color-danger) !important;
    background: var(--color-danger) !important;
    color: #fff !important;

    &:hover {
        opacity: 0.85;
    }
}
</style>
