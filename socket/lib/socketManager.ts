import io, { Socket } from "socket.io-client";
let globalSocket: Socket | null = null;
export const getGlobalSocket = () => {
  if (!globalSocket) {
    globalSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL, {
      transports: ["websocket", "polling"],
      timeout: 20000,
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    globalSocket.on("connect", () => {
      console.log("Socket connected:", globalSocket?.id);
    });
    globalSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });
    globalSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
    console.log("Socket connection created");
  }
  return globalSocket;
};
export const disconnectGlobalSocket = () => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
    console.log("Socket connection disconnected");
  }
};
export const isSocketConnected = () => {
  return globalSocket?.connected || false;
};
export { globalSocket };
