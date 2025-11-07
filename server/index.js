import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Server } from "socket.io";
import dotenv from "dotenv";
import gameManager from "./src/gameManager.js";
import ChatMessage from "./src/models/ChatMessage.js";
import User from "./src/models/User.js";
import { updateEloForMatch } from "./src/elo.js";
import GlickoPkg from "glicko2";
import { OAuth2Client } from "google-auth-library";
// glicko2 package may export a default or named Glicko2 class depending on bundler
const Glicko2 = GlickoPkg?.Glicko2 || GlickoPkg?.default || GlickoPkg;

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// In-memory map of online users keyed by socketId
const onlineUsers = new Map();
// Pending room removal timers: roomId -> Timeout
const pendingRoomTimeouts = new Map();
// How long to keep a room when a player disconnects (ms)
const RECONNECT_GRACE_MS = 120 * 1000;

// Helper: enrich chat messages with avatar (from onlineUsers map or DB)
async function enrichMessagesWithAvatars(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const socketIds = Array.from(
    new Set(
      messages.map((m) => (m.socketId ? m.socketId : null)).filter(Boolean)
    )
  );
  const users = socketIds.length
    ? await User.find({ socketId: { $in: socketIds } }).lean()
    : [];
  const userMap = new Map();
  for (const u of users) userMap.set(u.socketId, u);

  return messages.map((m) => {
    const sid = m.socketId;
    const online = sid ? onlineUsers.get(sid) : null;
    const fromDb = sid ? userMap.get(sid) : null;
    return {
      ...m,
      avatar: online?.avatar ?? (fromDb && fromDb.avatar) ?? null,
    };
  });
}

async function emitOnlineUsers() {
  try {
    const arr = Array.from(onlineUsers.values());
    io.emit("online-users", { users: arr });
  } catch (e) {
    console.error("Failed to emit online users", e);
  }
}

// Helper: emit a lightweight snapshot of active rooms to all clients
function getRoomsSnapshot() {
  try {
    const arr = [];
    for (const [roomId, gs] of gameManager.rooms.entries()) {
      arr.push({
        roomId,
        status: gs.status,
        createdAt: gs.createdAt || null,
        player1: {
          name: gs.players?.player1?.name || null,
          socketId: gs.players?.player1?.socketId || null,
          avatar: gs.players?.player1?.avatar || null,
          elo: gs.players?.player1?.elo ?? null,
        },
        player2: gs.players?.player2
          ? {
              name: gs.players.player2.name || null,
              socketId: gs.players.player2.socketId || null,
              avatar: gs.players.player2.avatar || null,
              elo: gs.players.player2.elo ?? null,
            }
          : null,
        spectators: Array.isArray(gs.spectators) ? gs.spectators.length : 0,
      });
    }
    return arr;
  } catch (e) {
    console.error("Failed to build rooms snapshot", e);
    return [];
  }
}

function emitRoomsList() {
  try {
    const snapshot = getRoomsSnapshot();
    io.emit("rooms-list", { rooms: snapshot });
  } catch (e) {
    console.error("Failed to emit rooms list", e);
  }
}

function clearPendingRoomTimer(roomId) {
  try {
    const t = pendingRoomTimeouts.get(roomId);
    if (t) {
      clearTimeout(t);
      pendingRoomTimeouts.delete(roomId);
    }
  } catch (e) {
    /* ignore */
  }
}

// Helper: attach ELO (or rating) from User documents into a gameState object
async function attachEloToGameState(gameState) {
  if (!gameState) return gameState;
  try {
    const p1 = gameState.players?.player1;
    const p2 = gameState.players?.player2;
    if (p1) {
      const u1 = await User.findOne({ socketId: p1.socketId }).lean();
      if (u1) p1.elo = u1.elo ?? u1.rating ?? u1.rating;
    }
    if (p2) {
      const u2 = await User.findOne({ socketId: p2.socketId }).lean();
      if (u2) p2.elo = u2.elo ?? u2.rating ?? u2.rating;
    }
    // spectators
    if (Array.isArray(gameState.spectators)) {
      for (const s of gameState.spectators) {
        try {
          const us = await User.findOne({ socketId: s.socketId }).lean();
          if (us) s.elo = us.elo ?? us.rating ?? us.rating;
        } catch (e) {
          // ignore per-spectator failures
        }
      }
    }
  } catch (e) {
    console.error("attachEloToGameState error", e);
  }
  // debug log to help verify values while developing
  try {
    const p1debug = gameState.players?.player1;
    const p2debug = gameState.players?.player2;
    console.debug(
      "attachEloToGameState -> p1.elo:",
      p1debug && p1debug.elo,
      "p2.elo:",
      p2debug && p2debug.elo
    );
  } catch (e) {
    // ignore debug logging failures
  }
  return gameState;
}

// MongoDB connection (optional - can work without it)
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error", err));
}

app.get("/", (req, res) => res.send("ZCaro backend running..."));

// Google ID token verification endpoint
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.post("/auth/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: "Missing idToken" });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    // payload: { sub, email, name, picture, ... }
    const googleId = payload.sub;
    const name = payload.name || `Player ${googleId.slice(0, 6)}`;
    const email = payload.email;
    const avatar = payload.picture;

    const user = await User.findOneAndUpdate(
      { googleId },
      {
        $set: { name, email, avatar },
        $setOnInsert: { elo: 1200, rating: 1500, rd: 350, volatility: 0.06 },
      },
      { upsert: true, new: true }
    );

    return res.json({ user });
  } catch (err) {
    console.error("Google token verify failed", err);
    return res.status(401).json({ error: "Invalid idToken" });
  }
});

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);

  // Send current rooms snapshot to the newly connected socket so lobby shows up-to-date rooms
  try {
    const snapshot = getRoomsSnapshot();
    socket.emit("rooms-list", { rooms: snapshot });
  } catch (e) {
    console.error("Failed to send rooms snapshot on connect", e);
  }

  // Allow clients to explicitly request the current rooms snapshot
  socket.on("request-rooms", () => {
    try {
      const snapshot = getRoomsSnapshot();
      socket.emit("rooms-list", { rooms: snapshot });
    } catch (e) {
      console.error("Failed to handle request-rooms", e);
    }
  });

  // Associate a connected socket with a persisted user (after Google login)
  socket.on("identify", async ({ userId }) => {
    try {
      if (!userId)
        return socket.emit("identify-failed", { error: "Missing userId" });
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
      // load user and add to online map
      try {
        const u = await User.findById(userId).lean();
        if (u) {
          onlineUsers.set(socket.id, {
            socketId: socket.id,
            name: u.name || `Player ${socket.id.slice(0, 6)}`,
            avatar: u.avatar || null,
            elo: u.elo ?? u.rating ?? null,
            _id: u._id,
          });
          emitOnlineUsers();
        }
      } catch (e) {
        console.error("Failed to load user after identify", e);
      }

      socket.emit("identified", { success: true, userId });
    } catch (e) {
      console.error("Failed to identify socket to user", e);
      socket.emit("identify-failed", { error: "Server error" });
    }
  });

  // Create a new room (persist a user record for this socket)
  socket.on("create-room", async ({ playerName, roomId: requestedRoomId }) => {
    // require authenticated user (must have been identified via /auth/google and 'identify' socket event)
    try {
      const authUser = await User.findOne({ socketId: socket.id }).lean();
      if (!authUser || !authUser.googleId) {
        socket.emit("auth-required", {
          message: "You must sign in with Google to create a room.",
        });
        return;
      }
    } catch (e) {
      console.error("Auth check failed", e);
      socket.emit("auth-required", { message: "Authentication check failed" });
      return;
    }
    // allow client to request a custom roomId (trim and basic sanitize)
    const playerNameFinal = playerName || `Player ${socket.id.slice(0, 6)}`;
    let roomId = null;
    if (requestedRoomId && typeof requestedRoomId === "string") {
      const clean = requestedRoomId.trim();
      if (clean.length > 0 && clean.length <= 64) {
        roomId = clean;
      }
    }
    // fallback to generated id
    if (!roomId) {
      roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    // if requested custom id exists, reject
    if (requestedRoomId && gameManager.getRoom(roomId)) {
      socket.emit("room-exists", {
        message: `Mã phòng đã tồn tại: ${roomId}`,
        roomId,
      });
      return;
    }

    // Persist or update user record for this socket connection
    try {
      await User.findOneAndUpdate(
        { socketId: socket.id },
        { $set: { name: playerNameFinal }, $setOnInsert: { elo: 1200 } },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.error("Failed to upsert user on create-room", e);
    }
    // Read persisted user (to get avatar if present)
    let userDoc = null;
    try {
      userDoc = await User.findOne({ socketId: socket.id }).lean();
    } catch (e) {
      console.error("Failed to load user after upsert", e);
    }

    // Add to online users map and broadcast
    try {
      if (userDoc) {
        onlineUsers.set(socket.id, {
          socketId: socket.id,
          name: userDoc.name || `Player ${socket.id.slice(0, 6)}`,
          avatar: userDoc.avatar || null,
          elo: userDoc.elo ?? userDoc.rating ?? null,
          _id: userDoc._id,
        });
        emitOnlineUsers();
      }
    } catch (e) {
      // non-fatal
      console.error("Failed to add online user after create-room", e);
    }

    const newGameState = gameManager.createRoom(roomId, {
      id: socket.id,
      socketId: socket.id,
      name: userDoc?.name || playerNameFinal,
      avatar: userDoc?.avatar || null,
    });
    socket.join(roomId);
    const enriched = await attachEloToGameState(newGameState);
    socket.emit("room-created", { roomId, gameState: enriched });
    // Notify all clients that rooms changed
    try {
      emitRoomsList();
    } catch (e) {
      // ignore
    }
  });

  // Join a room (send chat history if available)
  socket.on("join-room", async ({ roomId, playerName }) => {
    try {
      const gameState = gameManager.getRoom(roomId);

      if (!gameState) {
        // Room does not exist — inform the requester instead of implicitly creating one
        socket.emit("room-not-found", {
          message: `Phòng " ${roomId} " không tồn tại! `,
          roomId,
        });
        return;
      } else if (!gameState.players.player2) {
        // Join existing room as player 2
        const nameFinal = playerName || `Player ${socket.id.slice(0, 6)}`;

        // Persist or update user record for this socket (player2)
        try {
          await User.findOneAndUpdate(
            { socketId: socket.id },
            { $set: { name: nameFinal }, $setOnInsert: { elo: 1200 } },
            { upsert: true, new: true }
          );
        } catch (e) {
          console.error("Failed to upsert user on join-room (join)", e);
        }

        // load user doc to include avatar
        let userDoc2 = null;
        try {
          userDoc2 = await User.findOne({ socketId: socket.id }).lean();
        } catch (e) {
          console.error("Failed to load user on join", e);
        }

        const updatedGameState = gameManager.joinRoom(roomId, {
          id: socket.id,
          socketId: socket.id,
          name: userDoc2?.name || nameFinal,
          avatar: userDoc2?.avatar || null,
        });
        // If there was a pending removal timer for this room (someone previously disconnected), cancel it
        try {
          clearPendingRoomTimer(roomId);
        } catch (e) {
          /* ignore */
        }
        socket.join(roomId);
        // Do not auto-start; notify room that player joined and leave game in 'waiting' state
        const enriched = await attachEloToGameState(updatedGameState);
        io.to(roomId).emit("room-joined", { gameState: enriched });

        // notify lobby clients that rooms updated
        try {
          emitRoomsList();
        } catch (e) {
          /* ignore */
        }

        // Add to online users map and broadcast
        try {
          if (userDoc2) {
            onlineUsers.set(socket.id, {
              socketId: socket.id,
              name: userDoc2.name || `Player ${socket.id.slice(0, 6)}`,
              avatar: userDoc2.avatar || null,
              elo: userDoc2.elo ?? userDoc2.rating ?? null,
              _id: userDoc2._id,
            });
            emitOnlineUsers();
          }
        } catch (e) {
          console.error("Failed to add online user after join-room", e);
        }

        // Load recent chat history (last 200 messages)
        if (process.env.MONGO_URI) {
          try {
            const recent = await ChatMessage.find({ roomId })
              .sort({ timestamp: 1 })
              .limit(200)
              .lean();
            try {
              const enriched = await enrichMessagesWithAvatars(recent);
              io.to(roomId).emit("chat-history", { messages: enriched });
            } catch (e) {
              io.to(roomId).emit("chat-history", { messages: recent });
            }
          } catch (e) {
            console.error("Failed to load chat history", e);
          }
        } else {
          io.to(roomId).emit("chat-history", { messages: [] });
        }
      } else {
        // Room already has two players — allow joining as a spectator
        try {
          // Persist or update user record for this socket (spectator)
          const nameFinal = playerName || `Guest ${socket.id.slice(0, 6)}`;
          try {
            await User.findOneAndUpdate(
              { socketId: socket.id },
              { $set: { name: nameFinal }, $setOnInsert: { elo: 1200 } },
              { upsert: true, new: true }
            );
          } catch (e) {
            console.error("Failed to upsert user on join-room (spectator)", e);
          }

          let userDoc3 = null;
          try {
            userDoc3 = await User.findOne({ socketId: socket.id }).lean();
          } catch (e) {
            console.error("Failed to load spectator user", e);
          }

          const updated = gameManager.addSpectator(roomId, {
            id: socket.id,
            socketId: socket.id,
            name: userDoc3?.name || nameFinal,
            avatar: userDoc3?.avatar || null,
          });
          // If someone rejoins as spectator or re-enters the room, cancel pending removal
          try {
            clearPendingRoomTimer(roomId);
          } catch (e) {
            /* ignore */
          }
          socket.join(roomId);
          const enrichedSpec = await attachEloToGameState(updated);
          io.to(roomId).emit("room-joined", { gameState: enrichedSpec });

          // notify lobby clients that rooms updated (spectator added)
          try {
            emitRoomsList();
          } catch (e) {
            /* ignore */
          }

          // add spectator to online list
          try {
            if (userDoc3) {
              onlineUsers.set(socket.id, {
                socketId: socket.id,
                name: userDoc3.name || `Guest ${socket.id.slice(0, 6)}`,
                avatar: userDoc3.avatar || null,
                elo: userDoc3.elo ?? userDoc3.rating ?? null,
                _id: userDoc3._id,
              });
              emitOnlineUsers();
            }
          } catch (e) {
            console.error("Failed to add online spectator", e);
          }

          // send chat history as usual
          if (process.env.MONGO_URI) {
            try {
              const recent = await ChatMessage.find({ roomId })
                .sort({ timestamp: 1 })
                .limit(200)
                .lean();
              try {
                const enriched = await enrichMessagesWithAvatars(recent);
                socket.emit("chat-history", { messages: enriched });
              } catch (e) {
                socket.emit("chat-history", { messages: recent });
              }
            } catch (e) {
              console.error("Failed to load chat history for spectator", e);
            }
          } else {
            socket.emit("chat-history", { messages: [] });
          }
        } catch (e) {
          console.error("Error adding spectator", e);
          socket.emit("room-full", { message: "Room is full" });
        }
      }
    } catch (err) {
      console.error("Error in join-room handler", err);
    }
  });

  // Find match (auto-matchmaking)
  socket.on("find-match", async ({ playerName }) => {
    // require authenticated user
    try {
      const authUser = await User.findOne({ socketId: socket.id }).lean();
      if (!authUser || !authUser.googleId) {
        socket.emit("auth-required", {
          message: "You must sign in with Google to find a match.",
        });
        return;
      }
    } catch (e) {
      console.error("Auth check failed", e);
      socket.emit("auth-required", { message: "Authentication check failed" });
      return;
    }

    // Debug: indicate we received a find-match request
    try {
      console.log(
        `[${new Date().toISOString()}] RECEIVED find-match from ${
          socket.id
        } playerName=${playerName}`
      );
      console.log(
        `[${new Date().toISOString()}] QUEUE BEFORE enqueue: [${Array.from(
          gameManager.waitingPlayers.keys()
        ).join(",")}] size=${gameManager.waitingPlayers.size}`
      );
    } catch (e) {
      /* ignore logging errors */
    }

    // Ensure requester is added to the waiting queue BEFORE attempting to match.
    // This avoids a race where two clients call find-match nearly simultaneously
    // and neither is present when the other's findMatch runs.
    let userDocForQueue = null;
    try {
      userDocForQueue = await User.findOne({ socketId: socket.id }).lean();
    } catch (e) {
      console.error("Failed to load user for matchmaking queue", e);
    }

    gameManager.addWaitingPlayer(socket.id, {
      id: socket.id,
      socketId: socket.id,
      name:
        playerName ||
        (userDocForQueue && userDocForQueue.name) ||
        `Player ${socket.id.slice(0, 6)}`,
      avatar: userDocForQueue?.avatar || null,
      elo: userDocForQueue?.elo ?? userDocForQueue?.rating ?? null,
    });

    try {
      console.log(
        `[${new Date().toISOString()}] QUEUE AFTER enqueue: [${Array.from(
          gameManager.waitingPlayers.keys()
        ).join(",")}] size=${gameManager.waitingPlayers.size}`
      );
    } catch (e) {
      /* ignore */
    }

    // Now attempt to find a match (requester is guaranteed to be in waitingPlayers)
    const match = gameManager.findMatch(socket.id);

    if (match) {
      // Found a match, create room and join both
      // load current user to include avatar
      let curUser = null;
      try {
        curUser = await User.findOne({ socketId: socket.id }).lean();
      } catch (e) {
        console.error("Failed to load current user for matchmaking", e);
      }

      gameManager.createRoom(match.roomId, {
        id: socket.id,
        socketId: socket.id,
        name: curUser?.name || playerName || `Player ${socket.id.slice(0, 6)}`,
        avatar: curUser?.avatar || null,
      });
      socket.join(match.roomId);

      const opponentSocket = io.sockets.sockets.get(match.opponent.socketId);
      if (opponentSocket) {
        opponentSocket.join(match.opponent.roomId || match.roomId);
        // load opponent user to include avatar
        let oppUser = null;
        try {
          oppUser = await User.findOne({
            socketId: match.opponent.socketId,
          }).lean();
        } catch (e) {
          console.error("Failed to load opponent user for matchmaking", e);
        }

        const updatedGameState = gameManager.joinRoom(match.roomId, {
          id: match.opponent.id,
          socketId: match.opponent.socketId,
          name: oppUser?.name || match.opponent.name,
          avatar: oppUser?.avatar || null,
        });
        // notify both players that the opponent joined; game remains 'waiting' until started by owner
        const enrichedMatch = await attachEloToGameState(updatedGameState);
        io.to(match.roomId).emit("room-joined", {
          gameState: enrichedMatch,
        });
        // Notify lobby clients that rooms updated
        try {
          emitRoomsList();
        } catch (e) {
          /* ignore */
        }
      }
    } else {
      // No match found, notify the requester they are waiting
      socket.emit("waiting-for-match", { message: "Looking for opponent..." });
    }
  });

  // Cancel matchmaking
  socket.on("cancel-matchmaking", () => {
    gameManager.removeWaitingPlayer(socket.id);
    socket.emit("matchmaking-cancelled");
  });

  // Client can request the current room state (used after page refresh)
  socket.on("request-room-state", async ({ roomId }) => {
    try {
      if (!roomId) return;
      const gs = gameManager.getRoom(roomId);
      if (!gs) {
        socket.emit("room-not-found", {
          message: "Phòng không tồn tại",
          roomId,
        });
        return;
      }
      const enriched = await attachEloToGameState(gs);
      socket.emit("room-state", { gameState: enriched });
    } catch (e) {
      console.error("Failed to handle request-room-state", e);
    }
  });

  // Make a move
  socket.on("make-move", async ({ roomId, row, col }) => {
    const result = gameManager.makeMove(roomId, socket.id, row, col);

    if (result.error) {
      socket.emit("move-error", { error: result.error });
      return;
    }

    if (result.success) {
      const enrichedMove = await attachEloToGameState(result.gameState);
      io.to(roomId).emit("move-made", {
        gameState: enrichedMove,
        row,
        col,
        isWinner: result.isWinner,
        isDraw: result.isDraw,
      });

      // If the move finished the game, also emit a 'game-ended' event so clients
      // that only listen for game-ended (to show toasts/notifications) will be notified.
      if (result.isWinner || result.isDraw) {
        io.to(roomId).emit("game-ended", {
          gameState: enrichedMove,
          reason: "finished",
        });
      }

      // If game finished, update ELOs
      try {
        if (result.isWinner || result.isDraw) {
          const gs = result.gameState;
          const p1 = gs.players.player1;
          const p2 = gs.players.player2;
          if (p1 && p2) {
            const p1id = p1.socketId;
            const p2id = p2.socketId;
            if (result.isDraw) {
              await updateEloForMatch(io, gs.roomId, p1id, p2id, null, true);
            } else if (result.isWinner) {
              // winner is stored in gameState.winner as symbol ('X' or 'O')
              const winnerSymbol = gs.winner;
              const winnerSocket = winnerSymbol === "X" ? p1id : p2id;
              await updateEloForMatch(
                io,
                gs.roomId,
                p1id,
                p2id,
                winnerSocket,
                false
              );
            }
          }
        }
      } catch (e) {
        console.error("Failed to update ELO after game end", e);
      }
    }
  });

  // Handle timeouts: when a client reports their clock expired
  socket.on("time-expired", async ({ roomId }) => {
    try {
      const gs = gameManager.getRoom(roomId);
      if (!gs) return;

      // Mark forfeit and emit updated game state
      const updated = gameManager.forfeit(roomId, socket.id);
      if (updated) {
        const enrichedEnd = await attachEloToGameState(updated);
        io.to(roomId).emit("game-ended", {
          gameState: enrichedEnd,
          reason: "timeout",
        });

        // If both players exist, update ELOs
        const p1 = updated.players.player1;
        const p2 = updated.players.player2;
        if (p1 && p2) {
          const winnerSocket =
            updated.winner === p1.symbol ? p1.socketId : p2.socketId;
          try {
            await updateEloForMatch(
              io,
              updated.roomId,
              p1.socketId,
              p2.socketId,
              winnerSocket,
              false
            );
          } catch (e) {
            console.error("Failed to update ELO after timeout", e);
          }
        }
      }
    } catch (e) {
      console.error("Error handling time-expired", e);
    }
  });

  // Allow room owner to force-start a game when both players are present
  socket.on("start-game", async ({ roomId }) => {
    try {
      const gs = gameManager.getRoom(roomId);
      if (!gs) {
        socket.emit("start-error", { message: "Phòng không tồn tại" });
        return;
      }

      const p1 = gs.players.player1;
      const p2 = gs.players.player2;

      // Only player1 (room creator) may force-start
      if (!p1 || p1.socketId !== socket.id) {
        socket.emit("start-error", {
          message: "Chỉ chủ phòng mới được bắt đầu ván",
        });
        return;
      }

      if (!p2) {
        socket.emit("start-error", {
          message: "Chưa có đối thủ để bắt đầu ván",
        });
        return;
      }

      // Reset the room to a fresh board and start playing
      const restarted = gameManager.resetRoom(roomId);
      if (restarted) {
        const enrichedStart = await attachEloToGameState(restarted);
        io.to(roomId).emit("game-started", { gameState: enrichedStart });
      } else {
        socket.emit("start-error", { message: "Không thể bắt đầu ván mới" });
      }
    } catch (e) {
      console.error("Error handling start-game", e);
      socket.emit("start-error", { message: "Lỗi server khi bắt đầu ván" });
    }
  });

  // Chat message (persist if Mongo configured)
  socket.on("chat-message", async ({ roomId, message, sender }) => {
    try {
      if (!roomId || typeof message !== "string") return;
      const timestamp = Date.now();

      // Broadcast to room, include avatar if available
      try {
        const online = onlineUsers.get(socket.id);
        let avatar = online?.avatar ?? null;
        if (!avatar) {
          // fallback to DB lookup
          try {
            const u = await User.findOne({ socketId: socket.id }).lean();
            if (u) avatar = u.avatar || null;
          } catch (e) {
            // ignore DB failures
          }
        }

        io.to(roomId).emit("chat-message", {
          roomId,
          message,
          sender,
          timestamp,
          socketId: socket.id,
          avatar,
        });
      } catch (e) {
        // If enrichment fails, still emit basic message
        io.to(roomId).emit("chat-message", {
          roomId,
          message,
          sender,
          timestamp,
          socketId: socket.id,
        });
      }

      // Persist
      if (process.env.MONGO_URI) {
        try {
          await ChatMessage.create({
            roomId,
            message,
            sender,
            socketId: socket.id,
            timestamp: new Date(timestamp),
          });
        } catch (e) {
          console.error("Failed to save chat message", e);
        }
      }
    } catch (err) {
      console.error("Error handling chat-message", err);
    }
  });

  // Clear chat history for a room (only sockets in the room may request)
  socket.on("clear-chat", async ({ roomId }) => {
    try {
      if (!roomId) return;
      // Ensure the requesting socket is actually in the room
      if (!socket.rooms || !socket.rooms.has(roomId)) return;

      // If Mongo is configured, delete persisted chat messages
      if (process.env.MONGO_URI) {
        try {
          await ChatMessage.deleteMany({ roomId });
        } catch (e) {
          console.error("Failed to delete chat history", e);
        }
      }

      // Notify room that history is now empty
      io.to(roomId).emit("chat-history", { messages: [] });
    } catch (e) {
      console.error("Error handling clear-chat", e);
    }
  });

  // Client can request chat history for the room (returns recent messages only to requester)
  socket.on("request-chat-history", async ({ roomId }) => {
    try {
      if (!roomId) return;
      // Only service the request for sockets that are in the room
      if (!socket.rooms || !socket.rooms.has(roomId)) return;

      if (process.env.MONGO_URI) {
        try {
          const recent = await ChatMessage.find({ roomId })
            .sort({ timestamp: 1 })
            .limit(200)
            .lean();
          try {
            const enriched = await enrichMessagesWithAvatars(recent);
            socket.emit("chat-history", { messages: enriched });
          } catch (e) {
            socket.emit("chat-history", { messages: recent });
          }
        } catch (e) {
          console.error("Failed to load chat history for requester", e);
          socket.emit("chat-history", { messages: [] });
        }
      } else {
        socket.emit("chat-history", { messages: [] });
      }
    } catch (e) {
      console.error("Error handling request-chat-history", e);
    }
  });

  // Join a chat-only room (used for global or channel chat that are not game rooms)
  socket.on("join-chat-room", async ({ roomId }) => {
    try {
      if (!roomId) return;
      // Let the socket join the room so broadcast messages reach it
      socket.join(roomId);

      // Return recent chat history to the joining socket (if Mongo configured)
      if (process.env.MONGO_URI) {
        try {
          const recent = await ChatMessage.find({ roomId })
            .sort({ timestamp: 1 })
            .limit(200)
            .lean();
          try {
            const enriched = await enrichMessagesWithAvatars(recent);
            socket.emit("chat-history", { messages: enriched });
          } catch (e) {
            socket.emit("chat-history", { messages: recent });
          }
        } catch (e) {
          console.error("Failed to load chat history for join-chat-room", e);
          socket.emit("chat-history", { messages: [] });
        }
      } else {
        socket.emit("chat-history", { messages: [] });
      }
    } catch (e) {
      console.error("Error handling join-chat-room", e);
    }
  });

  // Leave a chat-only room
  socket.on("leave-chat-room", ({ roomId }) => {
    try {
      if (!roomId) return;
      socket.leave(roomId);
    } catch (e) {
      console.error("Error handling leave-chat-room", e);
    }
  });

  // Leave room
  socket.on("leave-room", ({ roomId }) => {
    socket.leave(roomId);
    const gs = gameManager.getRoom(roomId);
    if (!gs) return;
    // If leaving socket is one of the players, remove the whole room
    if (
      gs.players.player1?.socketId === socket.id ||
      gs.players.player2?.socketId === socket.id
    ) {
      gameManager.removeRoom(roomId);
      // clear any pending removal timers for this room
      try {
        clearPendingRoomTimer(roomId);
      } catch (e) {
        /* ignore */
      }
      socket.to(roomId).emit("opponent-left");
      try {
        emitRoomsList();
      } catch (e) {
        /* ignore */
      }
    } else {
      // Otherwise treat as spectator leaving
      gameManager.removeSpectator(roomId, socket.id);
      socket.to(roomId).emit("spectator-left", { socketId: socket.id });
      try {
        emitRoomsList();
      } catch (e) {
        /* ignore */
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    gameManager.removeWaitingPlayer(socket.id);

    // remove from online map and broadcast
    try {
      if (onlineUsers.has(socket.id)) {
        onlineUsers.delete(socket.id);
        emitOnlineUsers();
      }
    } catch (e) {
      console.error("Failed to remove online user on disconnect", e);
    }

    // Remove player from all rooms, but keep the room for a short reconnect window
    for (const [roomId, gameState] of gameManager.rooms.entries()) {
      try {
        // If the disconnecting socket was one of the two players, mark them as temporarily disconnected
        if (
          gameState.players.player1?.socketId === socket.id ||
          gameState.players.player2?.socketId === socket.id
        ) {
          // Inform remaining sockets in the room that a player temporarily left
          socket.to(roomId).emit("player-disconnected-temporary", {
            socketId: socket.id,
            graceMs: RECONNECT_GRACE_MS,
          });

          // Mutate the stored game state to mark the player slot as empty (preserve other state)
          if (gameState.players.player1?.socketId === socket.id) {
            gameState.players.player1.prevSocketId =
              gameState.players.player1.socketId;
            gameState.players.player1.socketId = null;
            gameState.players.player1.disconnectedAt = Date.now();
          }
          if (gameState.players.player2?.socketId === socket.id) {
            gameState.players.player2.prevSocketId =
              gameState.players.player2.socketId;
            gameState.players.player2.socketId = null;
            gameState.players.player2.disconnectedAt = Date.now();
          }

          // If there's not already a pending removal timer for this room, set one
          if (!pendingRoomTimeouts.has(roomId)) {
            const t = setTimeout(() => {
              try {
                const current = gameManager.getRoom(roomId);
                if (!current) {
                  pendingRoomTimeouts.delete(roomId);
                  return;
                }

                const p1Gone =
                  !current.players.player1 || !current.players.player1.socketId;
                const p2Gone =
                  !current.players.player2 || !current.players.player2.socketId;

                // If either player slot is still empty after grace period, remove the room
                if (p1Gone || p2Gone) {
                  gameManager.removeRoom(roomId);
                  try {
                    io.to(roomId).emit("room-removed", { roomId });
                  } catch (e) {
                    /* ignore */
                  }
                  try {
                    emitRoomsList();
                  } catch (e) {
                    /* ignore */
                  }
                }
              } catch (e) {
                console.error("Error during pending room removal", e);
              } finally {
                pendingRoomTimeouts.delete(roomId);
              }
            }, RECONNECT_GRACE_MS);
            pendingRoomTimeouts.set(roomId, t);
          }
        } else {
          // If leaving socket was not a player, treat as spectator leaving as before
          gameManager.removeSpectator(roomId, socket.id);
          socket.to(roomId).emit("spectator-left", { socketId: socket.id });
          try {
            emitRoomsList();
          } catch (e) {
            /* ignore */
          }
        }
      } catch (e) {
        console.error("Error handling disconnect for room", roomId, e);
      }
    }
  });

  socket.on("rating-updated", (payload) => {
    // cập nhật UI (player ratings)
  });
});

server.listen(process.env.PORT || 4000, () =>
  console.log("🚀 Server running on port", process.env.PORT || 4000)
);

// Periodic matchmaking pass: re-evaluate waiting queue so that when allowed
// windows expand (as players wait), matches are created automatically even
// if clients don't re-emit `find-match`.
const MATCHER_INTERVAL_MS = parseInt(
  process.env.MATCHER_INTERVAL_MS || "1000",
  10
);
setInterval(async () => {
  try {
    const waiting = Array.from(gameManager.waitingPlayers.keys());
    for (const sid of waiting) {
      try {
        // findMatch will remove matched entries from the queue
        const match = gameManager.findMatch(sid);
        if (!match) continue;

        // create room & join sockets (same flow as in the on('find-match') handler)
        let curUser = null;
        try {
          curUser = await User.findOne({ socketId: sid }).lean();
        } catch (e) {
          /* ignore */
        }

        gameManager.createRoom(match.roomId, {
          id: sid,
          socketId: sid,
          name: curUser?.name || `Player ${sid.slice(0, 6)}`,
          avatar: curUser?.avatar || null,
        });

        const requesterSocket = io.sockets.sockets.get(sid);
        if (requesterSocket) requesterSocket.join(match.roomId);

        const opponentSocket = io.sockets.sockets.get(match.opponent.socketId);
        if (opponentSocket) opponentSocket.join(match.roomId);

        // load opponent user to include avatar
        let oppUser = null;
        try {
          oppUser = await User.findOne({
            socketId: match.opponent.socketId,
          }).lean();
        } catch (e) {
          /* ignore */
        }

        const updatedGameState = gameManager.joinRoom(match.roomId, {
          id: match.opponent.id,
          socketId: match.opponent.socketId,
          name: oppUser?.name || match.opponent.name,
          avatar: oppUser?.avatar || null,
        });

        const enrichedMatch = await attachEloToGameState(updatedGameState);
        io.to(match.roomId).emit("room-joined", { gameState: enrichedMatch });
        try {
          emitRoomsList();
        } catch (e) {
          /* ignore */
        }
      } catch (e) {
        console.error("Periodic matcher error for", sid, e);
      }
    }
  } catch (e) {
    console.error("Periodic matcher failed", e);
  }
}, MATCHER_INTERVAL_MS);

// Glicko2 settings
const settings = {
  tau: 0.5, // system constant (0.3-1.2 recommended)
  rating: 1500, // initial rating
  rd: 350, // initial RD
  vol: 0.06, // initial volatility
};

const glicko = new Glicko2(settings);

export async function updateGlickoForMatch(
  io,
  roomId,
  socketA,
  socketB,
  winnerSocket = null,
  isDraw = false
) {
  // load or create users
  const [uA, uB] = await Promise.all([
    User.findOneAndUpdate(
      { socketId: socketA },
      { $setOnInsert: { name: `Player ${socketA.slice(0, 6)}` } },
      { upsert: true, new: true }
    ),
    User.findOneAndUpdate(
      { socketId: socketB },
      { $setOnInsert: { name: `Player ${socketB.slice(0, 6)}` } },
      { upsert: true, new: true }
    ),
  ]);

  // Create Glicko Players
  const playerA = glicko.makePlayer(
    uA.rating ?? settings.rating,
    uA.rd ?? settings.rd,
    uA.volatility ?? settings.vol
  );
  const playerB = glicko.makePlayer(
    uB.rating ?? settings.rating,
    uB.rd ?? settings.rd,
    uB.volatility ?? settings.vol
  );

  // Create a match list for the rating period (we update immediately for single match)
  const matches = [];
  if (isDraw) {
    matches.push([playerA, playerB, 0.5]);
    matches.push([playerB, playerA, 0.5]);
  } else if (winnerSocket === socketA) {
    matches.push([playerA, playerB, 1]);
    matches.push([playerB, playerA, 0]);
  } else if (winnerSocket === socketB) {
    matches.push([playerA, playerB, 0]);
    matches.push([playerB, playerA, 1]);
  } else {
    return null;
  }

  // Create a Glicko rating group and update
  const ratingGroup = glicko.makeRatingGroup();
  ratingGroup.addRating(playerA);
  ratingGroup.addRating(playerB);

  // feed matches for update
  // note: some libs accept (player, opponent, score)
  matches.forEach(
    ([p, o, s]) => ratingGroup.addRating(p) && ratingGroup.addOpponent(o, s)
  );

  // compute new ratings
  ratingGroup.updateRatings();

  // After update, fetch new values:
  const newA = playerA.getRating();
  const newRdA = playerA.getRd();
  const newVolA = playerA.getVol();

  const newB = playerB.getRating();
  const newRdB = playerB.getRd();
  const newVolB = playerB.getVol();

  // persist to DB
  await Promise.all([
    User.findByIdAndUpdate(uA._id, {
      rating: newA,
      rd: newRdA,
      volatility: newVolA,
      $inc: { gamesPlayed: 1 },
    }),
    User.findByIdAndUpdate(uB._id, {
      rating: newB,
      rd: newRdB,
      volatility: newVolB,
      $inc: { gamesPlayed: 1 },
    }),
  ]);

  // Optional: save history (EloHistory model can be reused with fields 'before'/'after')
  // Emit to room
  io.to(roomId).emit("rating-updated", {
    players: [
      {
        socketId: socketA,
        before: uA.rating,
        after: newA,
        rdBefore: uA.rd,
        rdAfter: newRdA,
      },
      {
        socketId: socketB,
        before: uB.rating,
        after: newB,
        rdBefore: uB.rd,
        rdAfter: newRdB,
      },
    ],
  });

  return {
    socketA: { before: uA.rating, after: newA },
    socketB: { before: uB.rating, after: newB },
  };
}
