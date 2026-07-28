/**
 * CMD_GET_MASK (0x07) — 获取当前从机屏蔽位图
 *
 * 请求: 无 Payload
 * 响应: u16 current_mask (当前屏蔽位图, bit N = 1 表示从机 #N 被屏蔽)
 *   返回 boolean[16]，true 表示从机 #N 被屏蔽
 */

import { CMD_GET_MASK } from '../types.js';
import { readU16LE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_GET_MASK;

/**
 * 构建请求负载
 * @returns 空 Buffer (本命令无请求参数)
 */
export const buildPayload = (): Buffer => Buffer.alloc(0);

/**
 * 解析响应负载
 * @param payload - 响应负载 (2 字节)
 * @returns boolean[16]；true 表示从机 #N 被屏蔽
 */
export const parseResponse = (payload: Buffer): boolean[] => {
    const mask = readU16LE(payload, 0);
    const result: boolean[] = [];
    for (let i = 0; i < 16; i++) {
        result.push((mask & (1 << i)) !== 0);
    }
    return result;
};
