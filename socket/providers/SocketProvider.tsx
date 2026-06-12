"use client";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, createContext, useContext } from "react";
import { Socket } from "socket.io-client";
import { getGlobalSocket } from "@/lib/socketManager";
const SocketContext = createContext<Socket | null>(null);
export const useSocket = () => {
  return useContext(SocketContext);
};
export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status }: any = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  useEffect(() => {
    if (!socket) {
      const socketInstance = getGlobalSocket();
      setSocket(socketInstance);
    }
  }, []);
  useEffect(() => {
    if (socket && session && session?.user?.id) {
      socket.emit("join", `${session?.user?.id}`);
      const handleMessage = (message: any) => {
        console.log(message);
      };
      socket.on("message", handleMessage);
      return () => {
        socket.off("message", handleMessage);
      };
    }
  }, [socket, session]);
  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
