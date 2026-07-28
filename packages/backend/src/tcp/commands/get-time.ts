/**
 * CMD_GET_TIME (0x01) — 获取主机时间戳
 *
 * 请求: 无 Payload
 * 响应: u64 timestamp_ms (小端序)
 *   - NTP 已同步: 有效 Unix 毫秒时间戳
 *   - NTP 未同步: 从 0 开始递增的相对时间戳
 */

import { CMD_GET_TIME } from '../types.js';
import { readU64LE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_GET_TIME;

/**
 * 构建请求负载
 * @returns 空 Buffer (本命令无请求参数)
 */
export const buildPayload = (): Buffer => Buffer.alloc(0);

/**
 * 解析响应负载
 * @param payload - 响应负载 (8 字节)
 * @returns Unix 毫秒时间戳；NTP 未同步时返回从 0 开始递增的相对时间戳
 */
export const parseResponse = (payload: Buffer): number => {
    return readU64LE(payload, 0);
};
