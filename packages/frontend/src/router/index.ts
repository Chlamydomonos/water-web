import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            redirect: '/dashboard',
        },
        {
            path: '/dashboard',
            name: 'dashboard',
            component: () => import('@/pages/DashboardPage.vue'),
            meta: { title: '仪表盘', icon: 'Odometer' },
        },
        {
            path: '/sensors',
            name: 'sensors',
            component: () => import('@/pages/SensorsPage.vue'),
            meta: { title: '传感器', icon: 'Connection' },
        },
        {
            path: '/sensors/:id/calibration',
            name: 'sensor-calibration',
            component: () => import('@/pages/CalibrationPage.vue'),
            meta: { title: '校准', hidden: true },
        },
        {
            path: '/tasks',
            name: 'tasks',
            component: () => import('@/pages/TasksPage.vue'),
            meta: { title: '任务', icon: 'Timer' },
        },
        {
            path: '/history',
            name: 'history',
            component: () => import('@/pages/HistoryPage.vue'),
            meta: { title: '历史', icon: 'TrendCharts' },
        },
    ],
});

export default router;
