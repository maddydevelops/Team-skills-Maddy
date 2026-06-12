import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import express from "express";
import prisma from "./prisma";

declare global {
  var ioInitialized: boolean;
  var io: Server | undefined;
}

let io: Server;

if (!global.ioInitialized) {
  global.ioInitialized = true;
  const app = express();
  const server = createServer(app);

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket: any) => {
    console.log("✓ User connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("✗ User disconnected:", socket.id);
    });

    socket.on("join", (userId: any) => {
      socket.join(userId);
      console.log(`✓ User ${userId} joined room ${userId}`);
    });
    socket.on("mark_read", (data: any) => {
      let conversationId = data.split("|")[0];
      let receiverId = data.split("|")[1];
      io.to(receiverId).emit("message_read", {
        conversation_id: conversationId,
      });
      prisma.message.updateMany({
        where: {
          conversation_id: conversationId,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      });
    });
  });

  global.io = io;

  (async () => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const pubClient = createClient({ url: redisUrl });
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✓ Socket.IO Redis adapter attached");
      } catch (err) {
        console.error("Redis adapter failed, starting without sync:", err);
      }
    }
    server.listen(process.env.SOCKET_PORT, () => {
      console.log(
        `✓ Socket.IO Server started on port ${process.env.SOCKET_PORT}`
      );
    });
  })();
} else {
  console.log(
    `ℹ Socket.IO Server already running on port ${process.env.SOCKET_PORT}`
  );
  io = global.io!;
}

export default io;
