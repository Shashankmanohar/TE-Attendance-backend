import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const initSocket = (server: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Client connected to WebSocket: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`Client disconnected from WebSocket: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

// Emit live scan event helper
export const emitLiveScan = (branchId: string, data: any) => {
  if (io) {
    // Broadcast to all clients (can also room-based join if branch-level separation is desired)
    io.emit('new_scan', { branchId, ...data });
  }
};
