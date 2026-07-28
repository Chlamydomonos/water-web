<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useSystemStore } from '@/stores/system';
import ConnectionDot from '@/components/ConnectionDot.vue';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { ElButton } from 'element-plus';

const router = useRouter();
const route = useRoute();
const themeStore = useThemeStore();
const systemStore = useSystemStore();

const tabs = [
    { path: '/dashboard', label: '仪表盘', icon: 'Odometer' },
    { path: '/sensors', label: '传感器', icon: 'Connection' },
    { path: '/tasks', label: '任务', icon: 'Timer' },
    { path: '/history', label: '历史', icon: 'TrendCharts' },
];

function onTabClick(path: string) {
    router.push(path);
}
</script>

<template>
    <header class="top-bar">
        <div class="top-bar__logo" @click="router.push('/')">Water</div>
        <nav class="top-bar__nav">
            <button
                v-for="tab in tabs"
                :key="tab.path"
                class="top-bar__tab"
                :class="{ 'top-bar__tab--active': route.path === tab.path }"
                @click="onTabClick(tab.path)"
            >
                {{ tab.label }}
            </button>
        </nav>
        <div class="top-bar__actions">
            <ElButton
                class="top-bar__theme-btn"
                :icon="themeStore.mode === 'light' ? Moon : Sunny"
                circle
                @click="themeStore.toggle()"
            />
            <ConnectionDot :connected="systemStore.espConnected" />
        </div>
    </header>
</template>

<style scoped lang="scss">
.top-bar {
    display: flex;
    align-items: center;
    height: 56px;
    padding: 0 var(--padding-pc);
    background: var(--card-bg);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-lg);
    flex-shrink: 0;
    // flex 项默认 min-width: auto 会阻止子项收缩，强制允许收缩并裁剪溢出
    min-width: 0;
    overflow: hidden;

    @media (max-width: 767px) {
        padding: 0 var(--padding-mobile);
        gap: var(--space-md);
    }
}

.top-bar__logo {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--color-primary);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
}

.top-bar__nav {
    display: flex;
    flex: 1;
    gap: var(--space-xs);
    // 关键：允许 nav 收缩到小于其内容宽度，超出部分内部横向滚动
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.top-bar__tab {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0; // 滚动容器内不被压扁，保证文字完整可滑出
    min-width: var(--touch-min);
    height: var(--touch-min);
    padding: 0 var(--space-md);
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;

    &:hover {
        color: var(--color-text);
        background: var(--color-bg-secondary);
    }

    &--active {
        color: var(--color-primary);
        background: var(--color-primary-light);
        font-weight: 600;
    }

    @media (max-width: 767px) {
        padding: 0 var(--space-sm);
        font-size: var(--font-size-sm);
        min-width: auto;
    }
}

.top-bar__actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
}

.top-bar__theme-btn {
    font-size: 18px;
    color: var(--color-text);

    &:hover {
        background: var(--color-bg-secondary) !important;
    }
}
</style>
