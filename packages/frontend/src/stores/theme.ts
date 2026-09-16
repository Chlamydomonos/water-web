import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

export type ThemeMode = 'light' | 'dark';

export const useThemeStore = defineStore(
    'theme',
    () => {
        const mode = ref<ThemeMode>('light');

        function toggle() {
            mode.value = mode.value === 'light' ? 'dark' : 'light';
        }

        function setTheme(theme: ThemeMode) {
            mode.value = theme;
        }

        function applyTheme(theme: ThemeMode) {
            document.documentElement.setAttribute('data-theme', theme);
        }

        // 监听 mode 变化同步 DOM 属性。
        // 持久化插件在 store 创建后通过 $patch 恢复 mode，watch 能捕获该变化并应用主题；
        // immediate 确保首次创建时也应用一次。
        watch(mode, applyTheme, { immediate: true });

        return { mode, toggle, setTheme };
    },
    {
        persist: true,
    },
);
