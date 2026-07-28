/**
 * CMD_CLEAR_BUFFER (0x03) — 清空缓冲区
 *
 * 请求: 无 Payload
 * 响应: u16 cleared_count (被清空的条目数量, 小端序)
 */

import { CMD_CLEAR_BUFFER, readU16LE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_CLEAR_BUFFER;

/**
 * 构建请求负载
 * @returns 空 Buffer (本命令无请求参数)
 */
export const buildPayload = (): Buffer => Buffer.alloc(0);

/**
 * 解析响应负载
 * @param payload - 响应负载 (2 字节)
 * @returns 被清空的条目数量
 */
export const parseResponse = (payload: Buffer): number => {
    return readU16LE(payload, 0);
};
