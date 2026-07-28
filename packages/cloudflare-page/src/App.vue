<script setup lang="ts">
import { ref, onMounted } from 'vue';

/** 目标后端 IP 列表，会依次尝试 /api/health */
const TARGETS = [
    { host: '192.168.0.25', port: 3637 },
    { host: '172.30.0.1', port: 3637 },
] as const;

const state = ref<'probing' | 'unreachable'>('probing');
const checking = ref('');

onMounted(async () => {
    for (const t of TARGETS) {
        const url = `http://${t.host}:${t.port}/api/health`;
        checking.value = url;
        try {
            const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                // 后端可达 → 直接跳转到该地址的前端页面
                window.location.href = `http://${t.host}:${t.port}`;
                return;
            }
        } catch {
            // 不可达，继续尝试下一个
        }
    }
    state.value = 'unreachable';
});

/** 重新加载页面 */
function retry() {
    window.location.reload();
}
</script>

<template>
    <div class="landing">
        <!-- ── 探测中 ── -->
        <template v-if="state === 'probing'">
            <div class="spinner"></div>
            <p class="hint">正在检测控制器连接…</p>
            <p class="checking-url">{{ checking }}</p>
        </template>

        <!-- ── 不可达 ── -->
        <div v-else class="unreachable">
            <h1>⚠️ 无法连接到控制器</h1>
            <p>请确保您的设备与灌溉控制器处于<strong>同一局域网</strong>后再试。</p>
            <button class="retry-btn" @click="retry">重新检测</button>
        </div>
    </div>
</template>

<style scoped>
.landing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 2rem;
    text-align: center;
    font-family:
        system-ui,
        -apple-system,
        'Segoe UI',
        Roboto,
        sans-serif;
    background: #f5f7fa;
    color: #303133;
}

.spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #dcdfe6;
    border-top-color: #409eff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1.5rem;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.hint {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
}

.checking-url {
    font-size: 0.85rem;
    color: #909399;
    font-family: monospace;
}

.unreachable {
    max-width: 400px;
}

.unreachable h1 {
    font-size: 1.3rem;
    margin-bottom: 0.75rem;
}

.unreachable p {
    font-size: 0.95rem;
    line-height: 1.6;
    color: #606266;
}

.retry-btn {
    margin-top: 1.5rem;
    padding: 0.6rem 2rem;
    border: none;
    border-radius: 6px;
    background: #409eff;
    color: #fff;
    font-size: 0.95rem;
    cursor: pointer;
}

.retry-btn:hover {
    background: #337ecc;
}
</style>
