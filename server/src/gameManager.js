import {
  createEmptyBoard,
  checkWinner,
  isBoardFull,
  BOARD_SIZE,
  generateLockedCells,
  getValidFirstMoveCells,
  isLockedCell,
} from "./gameLogic.js";

class GameManager {
  constructor() {
    this.rooms = new Map(); // roomId -> game state
    // waitingPlayers: socketId -> { id, socketId, name, avatar?, elo?, enqueuedAt }
    this.waitingPlayers = new Map();
  }

  createRoom(roomId, player1) {
    const lockedCells = generateLockedCells();
    const gameState = {
      roomId,
      board: createEmptyBoard(),
      players: {
        player1: {
          id: player1.id,
          socketId: player1.socketId,
          symbol: "X",
          name: player1.name,
          avatar: player1.avatar,
        },
        player2: null,
      },
      // spectators: array of {id, socketId, name, avatar}
      spectators: [],
      currentTurn: "X",
      status: "waiting", // waiting, playing, finished
      winner: null,
      lockedCells,
      validFirstMoveCells: getValidFirstMoveCells(lockedCells),
      moveCount: 0,
      createdAt: Date.now(),
      winningCells: [],
    };

    this.rooms.set(roomId, gameState);
    return gameState;
  }

  joinRoom(roomId, player2) {
    const gameState = this.rooms.get(roomId);
    if (!gameState || gameState.status !== "waiting") {
      return null;
    }
    gameState.players.player2 = {
      id: player2.id,
      socketId: player2.socketId,
      symbol: "O",
      name: player2.name,
      avatar: player2.avatar,
    };
    // Keep game in 'waiting' state until the room owner explicitly starts it

    return gameState;
  }

  // Add a spectator to an existing room (does not affect player slots)
  addSpectator(roomId, spectator) {
    const gameState = this.rooms.get(roomId);
    if (!gameState) return null;
    if (!gameState.spectators) gameState.spectators = [];
    // avoid duplicates
    const exists = gameState.spectators.find(
      (s) => s.socketId === spectator.socketId
    );
    if (!exists) {
      gameState.spectators.push({
        id: spectator.id,
        socketId: spectator.socketId,
        name: spectator.name,
        avatar: spectator.avatar,
      });
    }
    return gameState;
  }

  // Remove a spectator (e.g., on disconnect)
  removeSpectator(roomId, socketId) {
    const gameState = this.rooms.get(roomId);
    if (!gameState || !gameState.spectators) return;
    gameState.spectators = gameState.spectators.filter(
      (s) => s.socketId !== socketId
    );
  }

  makeMove(roomId, socketId, row, col) {
    const gameState = this.rooms.get(roomId);
    if (!gameState || gameState.status !== "playing") {
      return { error: "Invalid game state" };
    }

    // Find which player is making the move
    const player =
      gameState.players.player1.socketId === socketId
        ? gameState.players.player1
        : gameState.players.player2 &&
          gameState.players.player2.socketId === socketId
        ? gameState.players.player2
        : null;

    if (!player) {
      return { error: "Player not in this room" };
    }

    // Check if it's player's turn
    if (gameState.currentTurn !== player.symbol) {
      return { error: "Not your turn" };
    }

    // Check if cell is locked
    if (isLockedCell(gameState.lockedCells, row, col)) {
      return { error: "Không thể đi vào ô cấm!" };
    }

    // Check if cell is empty
    if (gameState.board[row][col] !== null) {
      return { error: "Cell already occupied" };
    }

    // Check first move restriction (must be around locked cells)
    if (gameState.moveCount === 0 && player.symbol === "X") {
      const isValidFirstMove = gameState.validFirstMoveCells.some(
        ([vr, vc]) => vr === row && vc === col
      );
      if (!isValidFirstMove) {
        return { error: "Lượt đầu tiên phải đi vào các ô xung quanh ô cấm!" };
      }
    }

    // Make the move
    gameState.board[row][col] = player.symbol;
    gameState.moveCount++;

    // Check for winner
    if (checkWinner(gameState.board, row, col, player.symbol)) {
      const winning = checkWinner(gameState.board, row, col, player.symbol);
      gameState.status = "finished";
      gameState.winner = player.symbol;
      gameState.winningCells = winning || [];
      return { success: true, gameState, isWinner: true };
    }

    // Check for draw
    if (isBoardFull(gameState.board)) {
      gameState.status = "finished";
      gameState.winner = "draw";
      gameState.winningCells = [];
      return { success: true, gameState, isDraw: true };
    }

    // Switch turn
    gameState.currentTurn = gameState.currentTurn === "X" ? "O" : "X";

    return { success: true, gameState };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // Forfeit: mark the game finished with the opponent as winner when a player times out
  forfeit(roomId, loserSocketId) {
    const gameState = this.rooms.get(roomId);
    if (!gameState) return null;

    const p1 = gameState.players.player1;
    const p2 = gameState.players.player2;

    if (!p1 || !p2) {
      // If opponent isn't present, just end the game as finished with no winner
      gameState.status = "finished";
      gameState.winner = null;
      gameState.winningCells = [];
      return gameState;
    }

    const loserIsP1 = p1.socketId === loserSocketId;
    const winnerSymbol = loserIsP1 ? p2.symbol : p1.symbol;

    gameState.status = "finished";
    gameState.winner = winnerSymbol;
    gameState.winningCells = [];

    return gameState;
  }

  // Reset the board and game metadata to start a fresh round while keeping players
  resetRoom(roomId) {
    const gameState = this.rooms.get(roomId);
    if (!gameState) return null;

    const lockedCells = generateLockedCells();
    gameState.board = createEmptyBoard();
    gameState.lockedCells = lockedCells;
    gameState.validFirstMoveCells = getValidFirstMoveCells(lockedCells);
    gameState.moveCount = 0;
    // Alternate who starts each new round. If lastStarter is not set (first
    // round), default to 'X'. Otherwise pick the opposite of lastStarter.
    const nextStarter = gameState.lastStarter
      ? gameState.lastStarter === "X"
        ? "O"
        : "X"
      : "X";
    gameState.currentTurn = nextStarter;
    // remember who started this round so the next reset can alternate
    gameState.lastStarter = nextStarter;
    gameState.status = "playing";
    gameState.winner = null;
    gameState.winningCells = [];
    gameState.createdAt = Date.now();

    return gameState;
  }

  removeRoom(roomId) {
    this.rooms.delete(roomId);
  }

  addWaitingPlayer(socketId, playerInfo) {
    const now = Date.now();
    this.waitingPlayers.set(socketId, {
      ...playerInfo,
      enqueuedAt: now,
    });
    try {
      console.log(
        `[${new Date().toISOString()}] QUEUE ADD: ${
          playerInfo.name || socketId
        } (${socketId}) enqueuedAt=${now} elo=${playerInfo.elo}`
      );
      console.log(
        `[${new Date().toISOString()}] QUEUE SIZE AFTER ADD: ${
          this.waitingPlayers.size
        } -> [${Array.from(this.waitingPlayers.keys()).join(",")}]`
      );
    } catch (e) {
      // ignore logging failures
    }
  }

  removeWaitingPlayer(socketId) {
    const had = this.waitingPlayers.has(socketId);
    this.waitingPlayers.delete(socketId);
    try {
      if (had) {
        console.log(
          `[${new Date().toISOString()}] QUEUE REMOVE: ${socketId} -> newSize=${
            this.waitingPlayers.size
          }`
        );
      }
    } catch (e) {
      // ignore
    }
  }

  findMatch(socketId) {
    const getDeltaForWait = (waitSeconds) => {
      if (waitSeconds <= 10) return 50;
      if (waitSeconds <= 20) return 100;
      if (waitSeconds <= 30) return 200;
      if (waitSeconds <= 45) return 300;
      if (waitSeconds <= 60) return 400;
      return 600; // >60s: ghép đại
    };

    const requester = this.waitingPlayers.get(socketId);
    if (!requester) return null;

    const now = Date.now();
    const requesterWaitSec = Math.floor(
      (now - (requester.enqueuedAt || now)) / 1000
    );
    const requesterElo =
      typeof requester.elo === "number" ? requester.elo : 1200;

    // 🔵 LOG: thông tin người đang tìm trận
    console.log(`\n🔍 [FIND MATCH] ${requester.name || socketId}`);
    console.log(
      `   🧩 ELO: ${requesterElo}, Wait: ${requesterWaitSec}s, Allowed: ±${getDeltaForWait(
        requesterWaitSec
      )}\n`
    );

    let best = null;
    let bestDiff = Infinity;

    for (const [otherId, other] of this.waitingPlayers.entries()) {
      if (otherId === socketId) continue;

      const otherWaitSec = Math.floor((now - (other.enqueuedAt || now)) / 1000);
      const otherElo = typeof other.elo === "number" ? other.elo : 1200;

      const allowedRequester = getDeltaForWait(requesterWaitSec);
      const allowedOther = getDeltaForWait(otherWaitSec);

      // Use the maximum allowed delta between the two players so that as one
      // player waits longer their allowed window increases and can match the
      // other player. This mirrors the original expanding-window behavior.
      const allowed = Math.max(allowedRequester, allowedOther);
      const diff = Math.abs(requesterElo - otherElo);

      const status = diff <= allowed ? "✅ GHÉP ĐƯỢC" : "❌ KHÔNG";
      console.log(
        `   ↪️ So sánh với ${
          other.name || otherId
        } | ELO: ${otherElo}, Wait: ${otherWaitSec}s, Diff: ${diff}, AllowedRequester: ±${allowedRequester}, AllowedOther: ±${allowedOther}, ChosenAllowed: ±${allowed} → ${status}`
      );

      if (diff <= allowed && diff < bestDiff) {
        best = { id: otherId, info: other };
        bestDiff = diff;
      }
    }

    if (best) {
      const roomId = `room-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      this.removeWaitingPlayer(best.id);
      this.removeWaitingPlayer(socketId);

      console.log(
        `\n🎯 [MATCH FOUND] ${
          requester.name || socketId
        } (ELO ${requesterElo}) ↔ ${best.info.name || best.id} (ELO ${
          best.info.elo
        })`
      );
      console.log(`   🏠 Room: ${roomId}\n`);

      return { roomId, opponent: best.info };
    }

    console.log(
      `⏳ [NO MATCH] ${
        requester.name || socketId
      } chưa tìm thấy đối thủ phù hợp.\n`
    );
    return null;
  }
}

export default new GameManager();
