import type { ApiResponse } from 'shared';

// Vite 代理模式下使用相对路径；独立部署时可设置 VITE_API_BASE 指向后端
const BASE_URL = import.meta.env.VITE_API_BASE ?? '';

class ApiClient {
    async post<T>(path: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
        const response = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : '{}',
        });
        if (!response.ok) {
            return {
                success: false,
                error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
            };
        }
        return response.json();
    }
}

export const api = new ApiClient();
