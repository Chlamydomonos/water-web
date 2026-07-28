/**
 * CMD_SET_VALVE (0x05) — 设置电磁阀状态
 *
 * 请求: u8 target_state
 *   - 0x00: 关闭电磁阀
 *   - 0x01: 打开电磁阀
 *   - 其他值: 非法 → 返回 STATUS_ERR_INVALID_PARAM
 * 响应: u8 actual_state (执行后的实际状态)
 *
 * 副作用:
 *   - SET_VALVE=1 → 电磁阀打开 → 阀门看门狗开始计时 (60s)
 *   - SET_VALVE=0 → 电磁阀关闭 → 阀门看门狗清零
 */

import { CMD_SET_VALVE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_SET_VALVE;

/**
 * 构建请求负载
 * @param targetState - 目标状态 (0 = 关闭, 1 = 打开)
 * @returns 包含 target_state 的 Buffer
 */
export const buildPayload = (targetState: number): Buffer => {
    const buf = Buffer.alloc(1);
    buf[0] = targetState;
    return buf;
};

/**
 * 解析响应负载
 * @param payload - 响应负载 (1 字节)
 * @returns 执行后的实际状态 (0 = 关闭, 1 = 打开)
 */
export const parseResponse = (payload: Buffer): number => {
    return payload[0]!;
};
