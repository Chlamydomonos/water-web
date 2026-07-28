import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ThemeMode = 'light' | 'dark';

export const useThemeStore = defineStore(
    'theme',
    () => {
        const mode = ref<ThemeMode>('light');

        function toggle() {
            mode.value = mode.value === 'light' ? 'dark' : 'light';
            applyTheme(mode.value);
        }

        function setTheme(theme: ThemeMode) {
            mode.value = theme;
            applyTheme(theme);
        }

        function applyTheme(theme: ThemeMode) {
            document.documentElement.setAttribute('data-theme', theme);
        }

        // 初始化时应用主题
        applyTheme(mode.value);

        return { mode, toggle, setTheme };
    },
    {
        persist: true,
    },
);
