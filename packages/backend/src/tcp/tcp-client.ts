/**
 * TcpClient — ESP32 灌溉系统 TCP 二进制协议客户端
 *
 * 封装与 ESP32 设备的 TCP 通信，支持协议 v1.1 中定义的全部 7 条命令。
 * 每条命令的具体实现位于 ./commands/ 目录下的独立文件中。
 *
 * 使用示例:
 *   const client = new TcpClient();
 *   await client.connect();
 *   const timestamp = await client.getTime();
 *   await client.disconnect();
 */

import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { MAGIC, HEADER_SIZE, CRC_SIZE } from './types.js';
import { readU16LE, writeU16LE, getStatusDescription } from './types.js';
import { crc16 } from './crc16.js';
import type { ParsedFrame, BufferEntry } from './types.js';

// 命令模块
import * as getTimeCmd from './commands/get-time.js';
import * as getBufferCmd from './commands/get-buffer.js';
import * as clearBufferCmd from './commands/clear-buffer.js';
import * as getValveCmd from './commands/get-valve.js';
import * as setValveCmd from './commands/set-valve.js';
import * as maskSlaveCmd from './commands/mask-slave.js';
import * as getMaskCmd from './commands/get-mask.js';

/** TcpClient 配置选项 */
export interface TcpClientOptions {
    /** TCP 连接超时 (毫秒), 默认 5000 */
    connectTimeout?: number;
    /** 命令响应超时 (毫秒), 默认 5000 */
    commandTimeout?: number;
    /** 是否启用断线自动重连, 默认 false (手动模式) */
    autoReconnect?: boolean;
    /** 重连初始间隔 (毫秒), 默认 3000 */
    reconnectInterval?: number;
    /** 重连最大间隔 (毫秒), 默认 30000 */
    reconnectMaxInterval?: number;
    /** 重连最大次数 (0 = 无限), 默认 0 */
    reconnectMaxAttempts?: number;
}

/**
 * TCP 二进制协议客户端
 *
 * 管理与 ESP32 设备的 TCP 长连接，负责帧的组装/解析、CRC 校验、
 * 序列号管理和应答匹配。
 */
export class TcpClient {
    /** TCP Socket 实例 */
    private socket: net.Socket | null = null;

    /** 当前序列号 (0~255 循环) */
    private seq = 0;

    /** 接收缓冲区 (处理 TCP 粘包/半包) */
    private receiveBuffer = Buffer.alloc(0);

    /** 命令发送互斥锁 (串行化所有 sendCommand，防止 receiveBuffer 竞态) */
    private sendLock: Promise<void> = Promise.resolve();

    /** 目标主机地址 (默认192.168.0.121) */
    private readonly host: string;

    /** 目标端口 (默认 8888) */
    private readonly port: number;

    /** 连接超时 */
    private readonly connectTimeout: number;

    /** 命令响应超时 */
    private readonly commandTimeout: number;

    /** 是否启用自动重连 */
    private readonly autoReconnect: boolean;

    /** 重连初始间隔 */
    private readonly reconnectInterval: number;

    /** 重连最大间隔 */
    private readonly reconnectMaxInterval: number;

    /** 重连最大次数 (0 = 无限) */
    private readonly reconnectMaxAttempts: number;

    /** 事件分发器 (生命周期事件, 与具体 socket 解耦, 重连后监听器不丢失) */
    private readonly emitter = new EventEmitter();

    /** 重连定时器句柄 */
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /** 当前重连尝试次数 (成功连接后归零) */
    private reconnectAttempts = 0;

    /** 是否处于主动断开中 (调用 disconnect 时置位, 抑制重连) */
    private manualDisconnecting = false;

    /** 内部事件常量 */
    private static readonly EV_CONNECTED = 'connected';
    private static readonly EV_DISCONNECTED = 'disconnected';
    private static readonly EV_RECONNECTING = 'reconnecting';
    private static readonly EV_RECONNECT_FAILED = 'reconnect_failed';
    private static readonly EV_ERROR = 'error';

    /**
     * 创建 TcpClient 实例
     *
     * @param host    - ESP32 设备 IP 地址
     * @param port    - TCP 端口, 默认 8888
     * @param options - 可选配置
     */
    constructor(host: string = '192.168.0.121', port = 8888, options: TcpClientOptions = {}) {
        this.host = host;
        this.port = port;
        this.connectTimeout = options.connectTimeout ?? 5000;
        this.commandTimeout = options.commandTimeout ?? 5000;
        this.autoReconnect = options.autoReconnect ?? false;
        this.reconnectInterval = options.reconnectInterval ?? 3000;
        this.reconnectMaxInterval = options.reconnectMaxInterval ?? 30000;
        this.reconnectMaxAttempts = options.reconnectMaxAttempts ?? 0;
    }

    // ================================================================
    // 连接管理
    // ================================================================

    /** 检查是否已连接 */
    get connected(): boolean {
        return this.socket !== null && !this.socket.destroyed;
    }

    /**
     * 注册事件监听器
     *
     * 支持的事件:
     *   - 'connected'    : TCP 连接建立成功 (含重连成功)
     *   - 'disconnected' : TCP 连接断开 (含被动断开)
     *   - 'reconnecting' : 即将发起一次重连尝试 { attempt, delayMs }
     *   - 'reconnect_failed': 重连最终失败 (达到最大次数)
     *   - 'error'        : 底层 socket 错误
     */
    on(event: 'connected', listener: () => void): this;
    on(event: 'disconnected', listener: () => void): this;
    on(event: 'reconnecting', listener: (info: { attempt: number; delayMs: number }) => void): this;
    on(event: 'reconnect_failed', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        this.emitter.on(event, listener);
        return this;
    }

    /** 移除事件监听器 */
    off(event: string, listener: (...args: any[]) => void): this {
        this.emitter.off(event, listener);
        return this;
    }

    /** 移除某事件全部监听器 (不传 event 则移除全部) */
    removeAllListeners(event?: string): this {
        if (event) this.emitter.removeAllListeners(event);
        else this.emitter.removeAllListeners();
        return this;
    }

    /**
     * 建立 TCP 连接 (单次)
     *
     * @throws 连接超时或失败时抛出错误
     */
    connect = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                return resolve();
            }

            this.manualDisconnecting = false;
            const socket = new net.Socket();
            this.socket = socket;
            this.receiveBuffer = Buffer.alloc(0);
            this.seq = 0;

            // 绑定被动断开/错误事件, 触发自动重连
            socket.once('close', () => this.handleSocketClose());
            socket.on('error', (err) => this.handleSocketError(err));

            const timeoutHandle = setTimeout(() => {
                socket.destroy();
                reject(new Error(`连接超时 (${this.connectTimeout}ms): ${this.host}:${this.port}`));
            }, this.connectTimeout);

            socket.connect(this.port, this.host, () => {
                clearTimeout(timeoutHandle);
                // 首次成功借由 connect() 的 resolve 通知调用方, 同时广播事件
                this.onConnected();
                resolve();
            });

            socket.once('error', (err: Error) => {
                clearTimeout(timeoutHandle);
                reject(err);
            });
        });
    };

    /**
     * 自动模式入口: 发起首次连接, 失败时进入自动重连循环。
     *
     * 需要在构造时设置 autoReconnect: true。后续被动断开后会自动重连。
     */
    connectAuto = async (): Promise<void> => {
        if (!this.autoReconnect) {
            // 未启用自动重连时, 退化为单次连接
            return this.connect();
        }
        try {
            await this.connect();
        } catch (err) {
            // 首次失败也进入重连循环
            this.scheduleReconnect();
        }
    };

    /**
     * 断开 TCP 连接 (主动), 触发后不再自动重连。
     *
     * @param reconnect 停止后是否仍允许后续被动事件触发重连。默认 false。
     */
    disconnect = (reconnect = false): void => {
        this.manualDisconnecting = !reconnect;
        this.clearReconnectTimer();
        if (!reconnect) this.reconnectAttempts = 0;

        if (this.socket) {
            // 主动销毁时移除我们注册的 close 监听, 避免触发 handleSocketClose
            this.socket.removeAllListeners('close');
            this.socket.removeAllListeners('error');
            this.socket.destroy();
            this.socket = null;
            this.receiveBuffer = Buffer.alloc(0);
        }
    };

    // ================================================================
    // 自动重连内部实现
    // ================================================================

    /**
     * 计算第 attempts 次重连的退避间隔 (指数退避 + 上限封顶)。 */
    private computeBackoff(attempts: number): number {
        const exp = this.reconnectInterval * Math.pow(2, attempts);
        return Math.min(exp, this.reconnectMaxInterval);
    }

    /**
     * 安排下次重连 (指数退避)。 */
    private scheduleReconnect = (): void => {
        if (!this.autoReconnect) return;
        if (this.connected) return;

        this.reconnectAttempts += 1;

        if (this.reconnectMaxAttempts > 0 && this.reconnectAttempts > this.reconnectMaxAttempts) {
            console.error(`[tcp] 重连已达上限 ${this.reconnectMaxAttempts} 次, 放弃重连`);
            this.emitter.emit(TcpClient.EV_RECONNECT_FAILED);
            this.reconnectAttempts = 0;
            return;
        }

        const delayMs = this.computeBackoff(this.reconnectAttempts - 1);
        const attempt = this.reconnectAttempts;
        console.log(`[tcp] 将在 ${delayMs}ms 后进行第 ${attempt} 次重连 (上限 ${this.reconnectMaxAttempts || '∞'})`);
        this.emitter.emit(TcpClient.EV_RECONNECTING, { attempt, delayMs });

        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.reconnectOnce();
        }, delayMs);
    };

    /**
     * 执行一次重连尝试, 失败则继续退避。 */
    private reconnectOnce = async (): Promise<void> => {
        if (this.connected) return;
        try {
            await this.connect();
        } catch (err) {
            console.warn(`[tcp] 重连失败: ${(err as Error).message}`);
            this.scheduleReconnect();
        }
    };

    /** 取消挂起的重连定时器。 */
    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /** 清理销毁/孤立的 socket 引用。 */
    private cleanupSocket(): void {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.receiveBuffer = Buffer.alloc(0);
    }

    /**
     * 连接成功后的公共处理: 重置计数, 广播 connected。 */
    private onConnected(): void {
        const wasReconnect = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        this.manualDisconnecting = false;
        console.log('[tcp] ESP32 connected');
        this.emitter.emit(TcpClient.EV_CONNECTED, { reconnected: wasReconnect });
    }

    /**
     * 被动 close 事件处理。 */
    private handleSocketClose = (): void => {
        console.log('[tcp] ESP32 disconnected (socket close)');
        this.cleanupSocket();
        this.emitter.emit(TcpClient.EV_DISCONNECTED);

        if (this.autoReconnect && !this.manualDisconnecting) {
            this.scheduleReconnect();
        }
    };

    /**
     * 底层 error 事件处理 (仅记录/转发, close 事件会随后到达)。 */
    private handleSocketError = (err: Error): void => {
        console.error('[tcp] ESP32 socket error:', err.message);
        this.emitter.emit(TcpClient.EV_ERROR, err);
    };

    // ================================================================
    // 核心通信方法
    // ================================================================

    /**
     * 发送命令帧并等待响应 (串行化，防止并发命令共享 receiveBuffer)
     *
     * @param commandCode - 命令码
     * @param payload     - 请求负载
     * @param timeout     - 可选超时 (ms)，默认 commandTimeout
     */
    private sendCommand = (commandCode: number, payload: Buffer, timeout?: number): Promise<ParsedFrame> => {
        const task = this.sendLock.then(() => this.doSendCommand(commandCode, payload, timeout));
        this.sendLock = task.catch(() => {}) as unknown as Promise<void>;
        return task;
    };

    private doSendCommand = (commandCode: number, payload: Buffer, timeout?: number): Promise<ParsedFrame> => {
        const currentSeq = this.seq;
        this.seq = (this.seq + 1) & 0xff;
        const frame = this.buildRequestFrame(currentSeq, commandCode, payload);
        this.socket!.write(frame);
        return this.readResponseFrame(currentSeq, timeout);
    };

    /**
     * 组装请求帧
     *
     * 帧格式:
     *   [Magic:2] [Seq:1] [Cmd:1] [PayloadLen:2 LE] [Payload:N] [CRC16:2 LE]
     * CRC 覆盖范围: [Seq, Cmd, PayloadLen(u16), Payload]
     *
     * @param seq     - 序列号
     * @param cmd     - 命令码
     * @param payload - 负载数据
     * @returns 完整的请求帧 Buffer
     */
    private buildRequestFrame = (seq: number, cmd: number, payload: Buffer): Buffer => {
        const payloadLen = payload.length;
        const frame = Buffer.alloc(HEADER_SIZE + payloadLen + CRC_SIZE);

        // Magic
        MAGIC.copy(frame, 0);
        // Seq
        frame[2] = seq;
        // Command
        frame[3] = cmd;
        // Payload Len (u16 LE)
        writeU16LE(frame, 4, payloadLen);
        // Payload
        payload.copy(frame, HEADER_SIZE);

        // CRC: 覆盖 [Seq, Cmd, PayloadLen, Payload]
        const crcData = frame.subarray(2, HEADER_SIZE + payloadLen);
        const crc = crc16(crcData);
        writeU16LE(frame, HEADER_SIZE + payloadLen, crc);

        return frame;
    };

    /**
     * 从 TCP 流中读取并解析响应帧
     *
     * 处理 TCP 粘包/半包：在缓冲区中定位 Magic Number，
     * 确保收到完整帧后再解析。
     *
     * @param expectedSeq - 期望的序列号 (用于校验)
     * @returns 解析后的响应帧
     * @throws 超时、CRC 校验失败或序列号不匹配时抛出错误
     */
    private readResponseFrame = (expectedSeq: number, customTimeout?: number): Promise<ParsedFrame> => {
        const effectiveTimeout = customTimeout ?? this.commandTimeout;

        return new Promise((resolve, reject) => {
            const socket = this.socket!;

            const timeoutHandle = setTimeout(() => {
                cleanup();
                // 超时后清空接收缓冲区，防止残留数据污染后续命令的帧解析
                this.receiveBuffer = Buffer.alloc(0);
                reject(new Error(`命令响应超时 (${effectiveTimeout}ms)`));
            }, effectiveTimeout);

            // 数据到达处理
            const onData = (chunk: Buffer): void => {
                this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

                const frame = this.tryExtractFrame();
                if (frame) {
                    clearTimeout(timeoutHandle);
                    cleanup();

                    // 校验 CRC
                    if (!this.validateFrameCrc(frame)) {
                        reject(new Error('CRC 校验失败，响应帧已损坏'));
                        return;
                    }

                    // 解析帧字段
                    const seq = frame[2]!;
                    const status = frame[3]!;
                    const payloadLen = readU16LE(frame, 4);
                    const payload = frame.subarray(HEADER_SIZE, HEADER_SIZE + payloadLen);

                    resolve({ seq, status, payload });
                }
            };

            // 错误处理
            const onError = (err: Error): void => {
                clearTimeout(timeoutHandle);
                cleanup();
                reject(err);
            };

            // 连接关闭
            const onClose = (): void => {
                clearTimeout(timeoutHandle);
                cleanup();
                reject(new Error('连接已关闭'));
            };

            const cleanup = (): void => {
                socket.removeListener('data', onData);
                socket.removeListener('error', onError);
                socket.removeListener('close', onClose);
            };

            socket.on('data', onData);
            socket.once('error', onError);
            socket.once('close', onClose);

            // 尝试解析缓冲区中已有的数据 (可能在上次读取时已收到)
            const existingFrame = this.tryExtractFrame();
            if (existingFrame) {
                onData(Buffer.alloc(0));
            }
        });
    };

    /**
     * 尝试从接收缓冲区中提取完整帧
     *
     * @returns 完整帧 Buffer，若数据不完整则返回 null
     */
    private tryExtractFrame = (): Buffer | null => {
        // 查找 Magic Number
        const magicIndex = this.findMagicIndex();
        if (magicIndex < 0) {
            return null;
        }

        // 丢弃 Magic 之前的无效数据
        if (magicIndex > 0) {
            this.receiveBuffer = this.receiveBuffer.subarray(magicIndex);
        }

        // 检查是否有足够数据读取帧头 + CRC
        if (this.receiveBuffer.length < HEADER_SIZE + CRC_SIZE) {
            return null;
        }

        // 读取 Payload 长度
        const payloadLen = readU16LE(this.receiveBuffer, 4);
        const totalLen = HEADER_SIZE + payloadLen + CRC_SIZE;

        // 检查是否收到完整帧
        if (this.receiveBuffer.length < totalLen) {
            return null;
        }

        // 提取完整帧
        const frame = this.receiveBuffer.subarray(0, totalLen);
        this.receiveBuffer = this.receiveBuffer.subarray(totalLen);

        return frame;
    };

    /**
     * 在接收缓冲区中查找 Magic Number (0x57 0x41)
     *
     * @returns Magic 起始索引，未找到返回 -1
     */
    private findMagicIndex = (): number => {
        for (let i = 0; i < this.receiveBuffer.length - 1; i++) {
            if (this.receiveBuffer[i] === MAGIC[0] && this.receiveBuffer[i + 1] === MAGIC[1]) {
                return i;
            }
        }
        return -1;
    };

    /**
     * 校验响应帧的 CRC
     *
     * CRC 覆盖: [Seq, Status, PayloadLen(u16), Payload]
     *
     * @param frame - 完整响应帧
     * @returns CRC 是否匹配
     */
    private validateFrameCrc = (frame: Buffer): boolean => {
        const payloadLen = readU16LE(frame, 4);
        const crcData = frame.subarray(2, HEADER_SIZE + payloadLen);
        const expectedCrc = crc16(crcData);
        const actualCrc = readU16LE(frame, HEADER_SIZE + payloadLen);
        return expectedCrc === actualCrc;
    };

    /**
     * 发送命令并自动检查状态码
     *
     * @param commandCode - 命令码
     * @param payload     - 请求负载
     * @returns 响应负载 (不含帧头/CRC)
     * @throws 状态码非 OK 时抛出错误
     */
    private sendAndCheck = async (commandCode: number, payload: Buffer, timeout?: number): Promise<Buffer> => {
        const frame = await this.sendCommand(commandCode, payload, timeout);

        if (frame.status !== 0x00) {
            const desc = getStatusDescription(frame.status);
            throw new Error(`命令 0x${commandCode.toString(16)} 执行失败: ${desc}`);
        }

        return frame.payload;
    };

    // ================================================================
    // 公开 API — 各命令封装
    // ================================================================

    /**
     * 获取 ESP32 当前时间戳 (CMD_GET_TIME)
     *
     * @returns Unix 毫秒时间戳；NTP 未同步时返回从 0 开始递增的相对时间戳
     */
    getTime = async (): Promise<number> => {
        const payload = await this.sendAndCheck(getTimeCmd.commandCode, getTimeCmd.buildPayload());
        return getTimeCmd.parseResponse(payload);
    };

    /**
     * 获取缓冲区全部传感器数据 (CMD_GET_BUFFER)
     *
     * @returns 条目计数和按时间升序排列的采集数据
     */
    getBuffer = async (): Promise<{ count: number; entries: BufferEntry[] }> => {
        // 缓冲区满时响应约 28KB，ESP32 串行发送 + 局域网延迟可能需 >5s
        const payload = await this.sendAndCheck(getBufferCmd.commandCode, getBufferCmd.buildPayload(), 15000);
        return getBufferCmd.parseResponse(payload);
    };

    /**
     * 清空缓冲区 (CMD_CLEAR_BUFFER)
     *
     * @returns 被清空的条目数量
     */
    clearBuffer = async (): Promise<number> => {
        const payload = await this.sendAndCheck(clearBufferCmd.commandCode, clearBufferCmd.buildPayload());
        return clearBufferCmd.parseResponse(payload);
    };

    /**
     * 获取电磁阀状态 (CMD_GET_VALVE)
     *
     * @returns 0 = 关闭, 1 = 打开
     */
    getValve = async (): Promise<number> => {
        const payload = await this.sendAndCheck(getValveCmd.commandCode, getValveCmd.buildPayload());
        return getValveCmd.parseResponse(payload);
    };

    /**
     * 设置电磁阀状态 (CMD_SET_VALVE)
     *
     * 副作用: 打开时启动 60s 阀门看门狗，关闭时清零看门狗
     *
     * @param targetState - 0 = 关闭, 1 = 打开
     * @returns 执行后的实际状态
     */
    setValve = async (targetState: number): Promise<number> => {
        const payload = await this.sendAndCheck(setValveCmd.commandCode, setValveCmd.buildPayload(targetState));
        return setValveCmd.parseResponse(payload);
    };

    /**
     * 屏蔽/取消屏蔽指定从机 (CMD_MASK_SLAVE)
     *
     * 被屏蔽的从机不会触发 SENSOR_FAULT 状态，但其数据仍正常采集和写入缓冲区。
     *
     * @param slaveAddr - 从机地址 (0~15)
     * @param maskFlag  - true = 屏蔽, false = 取消屏蔽
     * @returns 操作后的完整屏蔽位图 (bit N = 1 表示从机 #N 被屏蔽)
     */
    maskSlave = async (slaveAddr: number, maskFlag: boolean): Promise<number> => {
        const payload = await this.sendAndCheck(
            maskSlaveCmd.commandCode,
            maskSlaveCmd.buildPayload(slaveAddr, maskFlag ? 1 : 0),
        );
        return maskSlaveCmd.parseResponse(payload);
    };

    /**
     * 获取当前从机屏蔽位图 (CMD_GET_MASK)
     *
     * @returns boolean[16]；true 表示从机 #N 被屏蔽
     */
    getMask = async (): Promise<boolean[]> => {
        const payload = await this.sendAndCheck(getMaskCmd.commandCode, getMaskCmd.buildPayload());
        return getMaskCmd.parseResponse(payload);
    };
}
