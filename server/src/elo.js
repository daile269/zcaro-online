import User from "./models/User.js";
import EloHistory from "./models/EloHistory.js";

export function expectedRating(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export function newRating(rA, rB, scoreA, k = 32) {
  const eA = expectedRating(rA, rB);
  return Math.round(rA + k * (scoreA - eA));
}

function getKFactor(gamesPlayed) {
  // Higher K for provisional players
  if (gamesPlayed < 30) return 40;
  return 32;
}

/**
 * Update ELO for a finished match between two socketIds.
 * - If isDraw === true, both players get score 0.5.
 * - If winnerSocketId is provided, that player gets 1, the other 0.
 * Emits 'elo-updated' to the room with updated ratings.
 */
export async function updateEloForMatch(
  io,
  roomId,
  socketA,
  socketB,
  winnerSocketId = null,
  isDraw = false
) {
  try {
    // Find or create users by socketId
    const [userA, userB] = await Promise.all([
      User.findOneAndUpdate(
        { socketId: socketA },
        { $setOnInsert: { name: `Player ${socketA.slice(0, 6)}`, elo: 1200 } },
        { upsert: true, new: true }
      ),
      User.findOneAndUpdate(
        { socketId: socketB },
        { $setOnInsert: { name: `Player ${socketB.slice(0, 6)}`, elo: 1200 } },
        { upsert: true, new: true }
      ),
    ]);

    const beforeA = userA.elo || 1200;
    const beforeB = userB.elo || 1200;
    let scoreA, scoreB;

    if (isDraw) {
      scoreA = 0.5;
      scoreB = 0.5;
    } else if (winnerSocketId === socketA) {
      scoreA = 1;
      scoreB = 0;
    } else if (winnerSocketId === socketB) {
      scoreA = 0;
      scoreB = 1;
    } else {
      // No winner info; do nothing
      return null;
    }

    const kA = getKFactor(userA.gamesPlayed || 0);
    const kB = getKFactor(userB.gamesPlayed || 0);

    const afterA = newRating(beforeA, beforeB, scoreA, kA);
    const afterB = newRating(beforeB, beforeA, scoreB, kB);

    // Persist updates
    await Promise.all([
      User.findByIdAndUpdate(userA._id, {
        elo: afterA,
        $inc: { gamesPlayed: 1 },
      }),
      User.findByIdAndUpdate(userB._id, {
        elo: afterB,
        $inc: { gamesPlayed: 1 },
      }),
    ]);

    // Save history
    await EloHistory.create([
      {
        userId: userA._id,
        opponentId: userB._id,
        before: beforeA,
        after: afterA,
        change: afterA - beforeA,
        result: isDraw ? "draw" : scoreA === 1 ? "win" : "loss",
      },
      {
        userId: userB._id,
        opponentId: userA._id,
        before: beforeB,
        after: afterB,
        change: afterB - beforeB,
        result: isDraw ? "draw" : scoreB === 1 ? "win" : "loss",
      },
    ]);

    // Emit update to the room
    io.to(roomId).emit("elo-updated", {
      players: [
        {
          socketId: socketA,
          before: beforeA,
          after: afterA,
          change: afterA - beforeA,
        },
        {
          socketId: socketB,
          before: beforeB,
          after: afterB,
          change: afterB - beforeB,
        },
      ],
    });

    return {
      socketA: { before: beforeA, after: afterA },
      socketB: { before: beforeB, after: afterB },
    };
  } catch (err) {
    console.error("ELO update failed", err);
    return null;
  }
}
