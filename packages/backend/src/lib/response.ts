import type { ApiSuccess, ApiError, ApiResponse } from 'shared';

/**
 * 构建成功响应
 */
export function ok<T>(data: T): ApiSuccess<T> {
    return { success: true, data };
}

/**
 * 构建业务错误响应
 */
export function fail(code: string, message: string): ApiError {
    return { success: false, error: { code, message } };
}

/**
 * 构建 500 内部错误响应
 */
export function internalError(message: string): ApiError {
    return { success: false, error: { code: 'INTERNAL_ERROR', message } };
}

export type { ApiResponse };
