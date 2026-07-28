<script setup lang="ts">
import { ElIcon } from 'element-plus';
import { WarningFilled } from '@element-plus/icons-vue';
</script>

<template>
    <div class="esp-disconnected-banner">
        <el-icon class="esp-disconnected-banner__icon"><WarningFilled /></el-icon>
        ESP32 设备未连接，部分功能不可用
    </div>
</template>

<style scoped lang="scss">
.esp-disconnected-banner {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    background: var(--banner-bg-danger);
    color: var(--banner-text-danger);
}

.esp-disconnected-banner__icon {
    flex-shrink: 0;
    font-size: 16px;
}
</style>
