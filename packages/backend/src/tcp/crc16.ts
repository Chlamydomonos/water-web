/**
 * CRC-16-CCITT (CRC-16/KERMIT) 校验实现
 *
 * 规范:
 *   - 多项式 (正向):  0x1021
 *   - 多项式 (反射):  0x8408 (实现中使用)
 *   - 初始值:         0x0000
 *   - 输入反转:       是 (逐字节 LSB-first 处理)
 *   - 输出反转:       否
 *   - 异或输出:       0x0000
 */

/**
 * 计算 CRC-16-CCITT 校验值
 *
 * @param data - 待校验数据
 * @returns 16 位 CRC 校验值
 */
export const crc16 = (data: Buffer): number => {
    let crc = 0x0000;

    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0x8408;
            } else {
                crc >>= 1;
            }
        }
    }

    return crc & 0xffff;
};
