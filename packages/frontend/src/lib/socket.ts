import { io, Socket } from 'socket.io-client';

// 独立部署时可通过 VITE_SOCKET_URL 指定后端地址；Vite 代理模式下留空走同源
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

const opts = {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
} as const;

export const socket: Socket = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);

export function connectSocket() {
    if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
    if (socket.connected) socket.disconnect();
}
