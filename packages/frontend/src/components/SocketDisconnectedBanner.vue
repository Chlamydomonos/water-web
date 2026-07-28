<script setup lang="ts">
import { ElIcon } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';
</script>

<template>
    <div class="socket-disconnected-banner">
        <el-icon class="socket-disconnected-banner__icon"><WarningFilled /></el-icon>
        WebSocket 连接断开，数据可能滞后
    </div>
</template>

<style scoped lang="scss">
.socket-disconnected-banner {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: var(--banner-bg-warning);
    color: var(--banner-text-warning);
}

.socket-disconnected-banner__icon {
    flex-shrink: 0;
    font-size: 16px;
}
</style>
