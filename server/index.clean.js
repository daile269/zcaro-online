import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import dotenv from "dotenv";
import gameManager from "./src/gameManager.js";

// Minimal, clean server file (alternate copy) to restore runnability quickly.

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173" },
});

function getRoomsSnapshot() {
  const arr = [];
  for (const [roomId, gs] of gameManager.rooms.entries()) {
    arr.push({
      roomId,
      status: gs.status,
      players: gs.players,
      spectators: gs.spectators?.length || 0,
    });
  }
  return arr;
}

function emitRoomsList() {
  io.emit("rooms-list", { rooms: getRoomsSnapshot() });
}

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);

  socket.on("find-match", ({ playerName }) => {
    const match = gameManager.findMatch(socket.id);
    if (match) {
      gameManager.createRoom(match.roomId, {
        id: socket.id,
        socketId: socket.id,
        name: playerName || `Player ${socket.id.slice(0, 6)}`,
      });
      socket.join(match.roomId);
      const opp = match.opponent;
      const oppSocket = io.sockets.sockets.get(opp.socketId);
      if (oppSocket) oppSocket.join(match.roomId);
      gameManager.joinRoom(match.roomId, {
        id: opp.id,
        socketId: opp.socketId,
        name: opp.name,
      });
      io.to(match.roomId).emit("room-joined", {
        gameState: gameManager.getRoom(match.roomId),
      });
      emitRoomsList();
      return;
    }

    gameManager.addWaitingPlayer(socket.id, {
      id: socket.id,
      socketId: socket.id,
      name: playerName || `Player ${socket.id.slice(0, 6)}`,
      elo: null,
    });
    socket.emit("waiting-for-match", { message: "Looking for opponent..." });
    emitRoomsList();
  });

  socket.on("cancel-matchmaking", () => {
    gameManager.removeWaitingPlayer(socket.id);
    socket.emit("matchmaking-cancelled");
    emitRoomsList();
  });

  socket.on("create-room", ({ playerName, roomId }) => {
    const id =
      roomId || `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    gameManager.createRoom(id, {
      id: socket.id,
      socketId: socket.id,
      name: playerName || `Player ${socket.id.slice(0, 6)}`,
    });
    socket.join(id);
    socket.emit("room-created", {
      roomId: id,
      gameState: gameManager.getRoom(id),
    });
    emitRoomsList();
  });

  socket.on("join-room", ({ roomId, playerName }) => {
    const gs = gameManager.getRoom(roomId);
    if (!gs) return socket.emit("room-not-found", { roomId });
    if (!gs.players.player2) {
      gameManager.joinRoom(roomId, {
        id: socket.id,
        socketId: socket.id,
        name: playerName || `Player ${socket.id.slice(0, 6)}`,
      });
      socket.join(roomId);
      io.to(roomId).emit("room-joined", {
        gameState: gameManager.getRoom(roomId),
      });
      emitRoomsList();
    } else {
      gameManager.addSpectator(roomId, {
        id: socket.id,
        socketId: socket.id,
        name: playerName || `Guest ${socket.id.slice(0, 6)}`,
      });
      socket.join(roomId);
      socket.emit("room-joined", { gameState: gameManager.getRoom(roomId) });
      emitRoomsList();
    }
  });

  socket.on("request-room-state", ({ roomId }) => {
    const gs = gameManager.getRoom(roomId);
    if (!gs) return socket.emit("room-not-found", { roomId });
    socket.emit("room-state", { gameState: gs });
  });

  socket.on("leave-room", ({ roomId }) => {
    socket.leave(roomId);
    const gs = gameManager.getRoom(roomId);
    if (!gs) return;
    if (
      gs.players.player1?.socketId === socket.id ||
      gs.players.player2?.socketId === socket.id
    ) {
      gameManager.removeRoom(roomId);
      socket.to(roomId).emit("opponent-left");
    } else {
      gameManager.removeSpectator(roomId, socket.id);
      socket.to(roomId).emit("spectator-left", { socketId: socket.id });
    }
    emitRoomsList();
  });

  socket.on("disconnect", () => {
    gameManager.removeWaitingPlayer(socket.id);
    for (const [roomId, gs] of gameManager.rooms.entries()) {
      if (
        gs.players.player1?.socketId === socket.id ||
        gs.players.player2?.socketId === socket.id
      ) {
        gameManager.removeRoom(roomId);
        socket.to(roomId).emit("opponent-left");
      } else {
        gameManager.removeSpectator(roomId, socket.id);
        socket.to(roomId).emit("spectator-left", { socketId: socket.id });
      }
    }
    emitRoomsList();
  });
});

server.listen(process.env.PORT || 4000, () =>
  console.log("🚀 Server running on port", process.env.PORT || 4000)
);
