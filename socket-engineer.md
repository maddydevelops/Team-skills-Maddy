# Socket Engineer

You are an expert in real-time WebSocket architecture using **Socket.IO** in a **Next.js + Node.js** monorepo. You understand the full lifecycle of socket connections — from server initialization and Redis scaling to client-side singleton management and React context delivery.

---

## Architecture Overview

The socket layer is split into four files with a clean separation between server and client concerns:

```
socket/
├── lib/
│   ├── io.ts             # Server: Socket.IO server bootstrap + Redis adapter
│   ├── socketHelper.ts   # Server: Utility to push notifications to a user room
│   └── socketManager.ts  # Client: Singleton socket connection manager
└── providers/
    └── SocketProvider.tsx  # Client: React context provider + useSocket() hook
```

The server runs as a **standalone Express/HTTP process** on its own port (`SOCKET_PORT`). The Next.js frontend connects to it via `NEXT_PUBLIC_SOCKET_URL`.

---

## Server Side

### `lib/io.ts` — Socket.IO Server Bootstrap

**Purpose:** Create and export a single, process-wide `Socket.IO` server instance. Guards against double-initialization in environments like Next.js that re-evaluate modules (e.g. hot reload, serverless cold starts).

**Singleton guard pattern:**
```ts
declare global {
  var ioInitialized: boolean;
  var io: Server | undefined;
}

if (!global.ioInitialized) {
  global.ioInitialized = true;
  // ... full server bootstrap
  global.io = io;
} else {
  io = global.io!; // reuse existing instance
}
```

**Server setup:**
- Creates an Express app and wraps it in a native `http.Server`
- Mounts `socket.io` on the HTTP server with CORS open to all origins on GET/POST
- Starts listening on `process.env.SOCKET_PORT`

**CORS config:**
```ts
new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
})
```

**Socket events handled:**

| Event | Payload | Behavior |
|---|---|---|
| `connection` | — | Logs `socket.id` on connect |
| `disconnect` | — | Logs `socket.id` on disconnect |
| `join` | `userId: string` | Calls `socket.join(userId)` — puts the socket in a private room named after the user's ID |
| `mark_read` | `"conversationId\|receiverId"` | Parses the pipe-delimited string, emits `message_read` to the receiver's room, and bulk-updates all messages in that conversation to `is_read: true` + `read_at: now` via Prisma |

**`mark_read` detail:**
```ts
socket.on("mark_read", (data: any) => {
  const conversationId = data.split("|")[0];
  const receiverId     = data.split("|")[1];

  io.to(receiverId).emit("message_read", { conversation_id: conversationId });

  prisma.message.updateMany({
    where: { conversation_id: conversationId },
    data:  { is_read: true, read_at: new Date() },
  });
});
```

**Redis adapter (optional horizontal scaling):**
- Reads `process.env.REDIS_URL`
- Creates a pub client and a duplicate sub client
- Connects both, then attaches `@socket.io/redis-adapter` so all Socket.IO servers in a cluster share the same rooms and events
- Falls back gracefully (no crash) if Redis is unavailable

```ts
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

---

### `lib/socketHelper.ts` — Server-Side Notification Utility

**Purpose:** Provide a clean, typed server-side function for pushing real-time notifications to a specific user from anywhere in the backend (API routes, background jobs, etc.).

**Interface:**
```ts
interface SendNotificationProps {
  userId: string;
  title:  string;
  body:   string;
  data:   Record<string, any>;
}
```

**Implementation:**
```ts
const sendNotification = async (message: SendNotificationProps) => {
  if (io) {
    io.to(message.userId).emit("message", { ...message });
  }
};
```

- Targets the user's private room (named by `userId`, joined via the `join` event)
- Emits the `message` event with the full notification payload
- Safe no-op if `io` is not yet initialized

**Usage anywhere in backend:**
```ts
import { sendNotification } from "@/socket/lib/socketHelper";

await sendNotification({
  userId: "user_abc",
  title:  "New Message",
  body:   "You have a new message from John",
  data:   { conversationId: "conv_123" },
});
```

---

## Client Side

### `lib/socketManager.ts` — Singleton Client Socket Manager

**Purpose:** Ensure only one `socket.io-client` connection is created per browser tab/session, no matter how many components call `getGlobalSocket()`.

**Singleton pattern:**
```ts
let globalSocket: Socket | null = null;

export const getGlobalSocket = () => {
  if (!globalSocket) {
    globalSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL, { ...options });
    // attach lifecycle listeners once
  }
  return globalSocket;
};
```

**Connection options:**
| Option | Value | Reason |
|---|---|---|
| `transports` | `["websocket", "polling"]` | Tries WebSocket first, falls back to long-polling |
| `timeout` | `20000` | 20s connection timeout |
| `forceNew` | `false` | Reuses the module-level singleton |
| `reconnection` | `true` | Auto-reconnect on drop |
| `reconnectionAttempts` | `5` | Give up after 5 failures |
| `reconnectionDelay` | `1000` | 1s between reconnect attempts |

**Lifecycle events attached once on creation:**
- `connect` → logs `socket.id`
- `disconnect` → logs reason string
- `connect_error` → logs error

**Exported utilities:**

| Export | Signature | Purpose |
|---|---|---|
| `getGlobalSocket` | `() => Socket` | Lazy-init and return the singleton |
| `disconnectGlobalSocket` | `() => void` | Disconnect and null out the singleton (cleanup on logout) |
| `isSocketConnected` | `() => boolean` | Returns `globalSocket?.connected \|\| false` |
| `globalSocket` | `Socket \| null` | Direct reference if needed |

**Call `disconnectGlobalSocket()` on user logout** to release the connection and reset the singleton so the next login creates a fresh socket.

---

### `providers/SocketProvider.tsx` — React Context Provider

**Purpose:** Initialize the socket once at the app tree level, join the authenticated user to their private room, and expose the socket instance to all child components via React context.

**Context and hook:**
```ts
const SocketContext = createContext<Socket | null>(null);
export const useSocket = () => useContext(SocketContext);
```

**Provider logic (two `useEffect`s):**

1. **Socket initialization** — runs once on mount, independent of auth state:
```ts
useEffect(() => {
  if (!socket) {
    const socketInstance = getGlobalSocket();
    setSocket(socketInstance);
  }
}, []);
```

2. **Room join + message listener** — runs when both `socket` and `session` are ready:
```ts
useEffect(() => {
  if (socket && session?.user?.id) {
    socket.emit("join", `${session.user.id}`);

    const handleMessage = (message: any) => { console.log(message); };
    socket.on("message", handleMessage);

    return () => { socket.off("message", handleMessage); }; // cleanup
  }
}, [socket, session]);
```

- Emits `join` with the user's ID so the server calls `socket.join(userId)` — giving the server a named room to target
- Listens for `message` events (notifications pushed via `sendNotification`)
- Cleans up the listener on unmount or when dependencies change

**Wrap at root layout:**
```tsx
// app/layout.tsx
import { SocketProvider } from "@/socket/providers/SocketProvider";

export default function RootLayout({ children }) {
  return (
    <SessionProvider>
      <SocketProvider>
        {children}
      </SocketProvider>
    </SessionProvider>
  );
}
```

**Consume in any component:**
```tsx
import { useSocket } from "@/socket/providers/SocketProvider";

function ChatBox() {
  const socket = useSocket();

  const markAsRead = (conversationId: string, receiverId: string) => {
    socket?.emit("mark_read", `${conversationId}|${receiverId}`);
  };
}
```

---

## Environment Variables

| Variable | Used In | Description |
|---|---|---|
| `SOCKET_PORT` | `io.ts` (server) | Port the standalone Socket.IO server listens on |
| `REDIS_URL` | `io.ts` (server) | Optional Redis URL for multi-instance pub/sub adapter |
| `NEXT_PUBLIC_SOCKET_URL` | `socketManager.ts` (client) | Full URL the browser connects to (e.g. `http://localhost:4000`) |

---

## Data Flow Diagrams

### Sending a Notification (Server → Client)

```
Backend API Route / Job
        │
        ▼
sendNotification({ userId, title, body, data })   [socketHelper.ts]
        │
        ▼
io.to(userId).emit("message", payload)            [io.ts — named room]
        │
        ▼
Socket.IO room → all sockets that joined with that userId
        │
        ▼
SocketProvider "message" handler fires             [SocketProvider.tsx]
        │
        ▼
UI updates
```

### Marking Messages as Read (Client → Server → Client)

```
ChatBox component
        │
socket.emit("mark_read", "convId|receiverId")
        │
        ▼
io.ts: "mark_read" handler
        ├── io.to(receiverId).emit("message_read", { conversation_id })
        │         │
        │         ▼
        │   Receiver's UI updates unread state
        │
        └── prisma.message.updateMany(...)  ← DB write (fire-and-forget)
```

### Client Connection Lifecycle

```
App mounts → SocketProvider mounts
        │
        ▼
getGlobalSocket()  [socketManager.ts]
  └── if no globalSocket: creates new io(SOCKET_URL, options)
        │
        ▼
socket connects to standalone Socket.IO server
        │
        ▼
session available → socket.emit("join", userId)
        │
        ▼
Server: socket.join(userId)  → user now in named room
```

---

## Key Patterns & Rules

- **Singleton on both sides:** `global.io` on the server, `globalSocket` module variable on the client. Never create multiple instances.
- **User rooms = userId strings:** The room name equals the user's ID. All server-to-client pushes target `io.to(userId)`.
- **`mark_read` payload is pipe-delimited:** `"conversationId|receiverId"` — parse with `split("|")`.
- **Redis is optional:** The server boots without Redis; the adapter is attached only if `REDIS_URL` is set. Required for multi-instance/PM2 cluster deployments.
- **`disconnectGlobalSocket()` on logout:** Call this to clean up the singleton so the next login gets a fresh, authenticated connection.
- **Cleanup socket listeners in `useEffect` returns:** Always return `socket.off(event, handler)` to prevent duplicate listeners on re-renders.
- **`sendNotification` is fire-and-forget safe:** It checks `if (io)` before emitting, so importing it before the server is ready won't crash.

---

## Full Source Code

### `socket/lib/io.ts`

```ts
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
```

---

### `socket/lib/socketHelper.ts`

```ts
export interface SendNotificationProps {
  userId: string;
  title: string;
  body: string;
  data: Record<string, any>;
}

import io from "./io";
const sendNotification = async (message: SendNotificationProps) => {
  if (io) {
    io.to(message.userId).emit("message", { ...message });
  }
};
export { sendNotification };
```

---

### `socket/lib/socketManager.ts`

```ts
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
```

---

### `socket/providers/SocketProvider.tsx`

```tsx
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
```
