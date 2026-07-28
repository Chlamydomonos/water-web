/**
 * CMD_GET_VALVE (0x04) — 获取电磁阀状态
 *
 * 请求: 无 Payload
 * 响应: u8 state
 *   - 0x00: 电磁阀关闭
 *   - 0x01: 电磁阀打开
 */

import { CMD_GET_VALVE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_GET_VALVE;

/**
 * 构建请求负载
 * @returns 空 Buffer (本命令无请求参数)
 */
export const buildPayload = (): Buffer => Buffer.alloc(0);

/**
 * 解析响应负载
 * @param payload - 响应负载 (1 字节)
 * @returns 电磁阀状态 (0 = 关闭, 1 = 打开)
 */
export const parseResponse = (payload: Buffer): number => {
    return payload[0]!;
};
