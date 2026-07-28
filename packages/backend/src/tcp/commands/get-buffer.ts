/**
 * CMD_GET_BUFFER (0x02) — 获取缓冲区全部数据
 *
 * 请求: 无 Payload
 * 响应: u16 count + count × BufferEntry (56 字节/条)
 *
 * BufferEntry 格式 (56 字节):
 *   Byte  0..7 : timestamp_ms  (u64 LE)
 *   Byte  8..10: slave[ 0]     (u16 pulse_count LE + u8 crc8)
 *   Byte 11..13: slave[ 1]     ...
 *   ...
 *   Byte 53..55: slave[15]     ...
 */

import { CMD_GET_BUFFER, readU16LE, readU64LE, parseSlaveData } from '../types.js';
import type { BufferEntry, SlaveData } from '../types.js';
import { BUFFER_ENTRY_SIZE, MAX_SLAVE_COUNT, SLAVE_DATA_SIZE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_GET_BUFFER;

/**
 * 构建请求负载
 * @returns 空 Buffer (本命令无请求参数)
 */
export const buildPayload = (): Buffer => Buffer.alloc(0);

/**
 * 解析响应负载
 * @param payload - 响应负载 (2 + count × 56 字节)
 * @returns 解析后的缓冲区条目数组和计数
 */
export const parseResponse = (payload: Buffer): { count: number; entries: BufferEntry[] } => {
    const count = readU16LE(payload, 0);
    const entries: BufferEntry[] = [];

    for (let i = 0; i < count; i++) {
        const offset = 2 + i * BUFFER_ENTRY_SIZE;
        const timestampMs = readU64LE(payload, offset);
        const slaves: SlaveData[] = [];

        // 每个从机占 3 字节，共 16 个从机
        for (let s = 0; s < MAX_SLAVE_COUNT; s++) {
            const slaveOffset = offset + 8 + s * SLAVE_DATA_SIZE;
            slaves.push(parseSlaveData(payload, slaveOffset));
        }

        entries.push({ timestampMs, slaves });
    }

    return { count, entries };
};
