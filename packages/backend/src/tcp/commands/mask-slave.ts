/**
 * CMD_MASK_SLAVE (0x06) — 屏蔽/取消屏蔽指定从机
 *
 * 请求: u8 slave_addr + u8 mask_flag
 *   - slave_addr: 从机地址 (0~15)
 *   - mask_flag:  0x00 = 取消屏蔽, 0x01 = 屏蔽
 * 响应: u16 new_mask (操作后的完整屏蔽位图, bit N = 1 表示从机 #N 被屏蔽)
 *
 * 副作用:
 *   - 屏蔽某从机后，若该从机正处于故障状态，系统状态可能需要重新评估
 *   - 取消屏蔽后，若该从机当前 CRC 失败，下一帧采集后会重新计入故障计数
 */

import { CMD_MASK_SLAVE, readU16LE } from '../types.js';

/** 本命令的命令码 */
export const commandCode = CMD_MASK_SLAVE;

/**
 * 构建请求负载
 * @param slaveAddr - 从机地址 (0~15)
 * @param maskFlag  - 0 = 取消屏蔽, 1 = 屏蔽
 * @returns 包含 slave_addr + mask_flag 的 Buffer
 */
export const buildPayload = (slaveAddr: number, maskFlag: number): Buffer => {
    const buf = Buffer.alloc(2);
    buf[0] = slaveAddr;
    buf[1] = maskFlag;
    return buf;
};

/**
 * 解析响应负载
 * @param payload - 响应负载 (2 字节)
 * @returns 操作后的完整屏蔽位图
 */
export const parseResponse = (payload: Buffer): number => {
    return readU16LE(payload, 0);
};
