/**
 * TCP 二进制通信协议 — 共享类型与常量
 *
 * 协议版本: v1.1
 * 适用项目: ESP32 自动灌溉系统
 */

// ============================================================
// 帧常量
// ============================================================

/** 帧头 Magic Number: "WA" (Water Assistant) */
export const MAGIC = Buffer.from([0x57, 0x41]);

/** 帧头大小 (Magic 2 + Seq 1 + Cmd/Status 1 + PayloadLen 2) */
export const HEADER_SIZE = 6;

/** CRC-16 校验值大小 */
export const CRC_SIZE = 2;

// ============================================================
// 命令码
// ============================================================

/** 获取主机当前时间戳 */
export const CMD_GET_TIME = 0x01;

/** 获取缓冲区全部数据 */
export const CMD_GET_BUFFER = 0x02;

/** 清空缓冲区 */
export const CMD_CLEAR_BUFFER = 0x03;

/** 获取电磁阀状态 */
export const CMD_GET_VALVE = 0x04;

/** 设置电磁阀状态 */
export const CMD_SET_VALVE = 0x05;

/** 屏蔽/取消屏蔽指定从机 */
export const CMD_MASK_SLAVE = 0x06;

/** 获取当前从机屏蔽位图 */
export const CMD_GET_MASK = 0x07;

// ============================================================
// 响应状态码
// ============================================================

/** 命令执行成功 */
export const STATUS_OK = 0x00;

/** 未知命令码 */
export const STATUS_ERR_UNKNOWN_CMD = 0x01;

/** 参数无效 */
export const STATUS_ERR_INVALID_PARAM = 0x02;

/** 内部错误 (I/O 失败、内存异常等) */
export const STATUS_ERR_INTERNAL = 0x03;

// ============================================================
// 数据结构类型
// ============================================================

/** 单个从机数据 (3 字节) */
export interface SlaveData {
    /** 脉冲计数 (u16 LE) */
    pulseCount: number;
    /** CRC-8 校验值 */
    crc8: number;
}

/** 缓冲区条目 (56 字节) */
export interface BufferEntry {
    /** 采集时刻 Unix 毫秒时间戳 (u64 LE) */
    timestampMs: number;
    /** 16 个从机数据 (索引 0~15) */
    slaves: SlaveData[];
}

/** 缓冲区条目固定大小 */
export const BUFFER_ENTRY_SIZE = 56;

/** 最大从机数量 */
export const MAX_SLAVE_COUNT = 16;

/** 单个从机数据大小 */
export const SLAVE_DATA_SIZE = 3;

// ============================================================
// 帧解析结果
// ============================================================

/** 解析后的响应帧 */
export interface ParsedFrame {
    /** 序列号 (原样返回) */
    seq: number;
    /** 响应状态码 */
    status: number;
    /** 负载数据 */
    payload: Buffer;
}

// ============================================================
// 工具函数
// ============================================================

/** 将 u16 写入 Buffer (小端序) */
export const writeU16LE = (buf: Buffer, offset: number, value: number): void => {
    buf.writeUInt16LE(value, offset);
};

/** 从 Buffer 读取 u16 (小端序) */
export const readU16LE = (buf: Buffer, offset: number): number => {
    return buf.readUInt16LE(offset);
};

/** 从 Buffer 读取 u64 (小端序)，返回 number */
export const readU64LE = (buf: Buffer, offset: number): number => {
    return Number(buf.readBigUInt64LE(offset));
};

/** 将 u64 写入 Buffer (小端序) */
export const writeU64LE = (buf: Buffer, offset: number, value: number): void => {
    buf.writeBigUInt64LE(BigInt(value), offset);
};

/** 从 Buffer 中解析单个 SlaveData */
export const parseSlaveData = (buf: Buffer, offset: number): SlaveData => {
    const pulseCount = readU16LE(buf, offset);
    const crc8 = buf[offset + 2]!;
    return { pulseCount, crc8 };
};

/** 获取状态码对应的描述信息 */
export const getStatusDescription = (status: number): string => {
    switch (status) {
        case STATUS_OK:
            return '成功';
        case STATUS_ERR_UNKNOWN_CMD:
            return '未知命令码';
        case STATUS_ERR_INVALID_PARAM:
            return '参数无效';
        case STATUS_ERR_INTERNAL:
            return '内部错误';
        default:
            return `未知状态码 (0x${status.toString(16).padStart(2, '0')})`;
    }
};
