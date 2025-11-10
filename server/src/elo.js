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
    // Debug: show which sockets we were asked to update so we can trace missing users
    console.debug(
      `[ELO] updateEloForMatch called for room=${roomId} socketA=${socketA} socketB=${socketB} winner=${winnerSocketId} isDraw=${isDraw}`
    );
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

    // Log what we found/created so it's easy to debug missing entries
    console.debug(
      `[ELO] userA: id=${userA?._id} socketId=${userA?.socketId} elo=${userA?.elo}`
    );
    console.debug(
      `[ELO] userB: id=${userB?._id} socketId=${userB?.socketId} elo=${userB?.elo}`
    );

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

    // Confirm persistence in logs (helps debug DB vs emit timing)
    console.debug(
      `[ELO] persisted: room=${roomId} ${socketA} ${beforeA}->${afterA}; ${socketB} ${beforeB}->${afterB}`
    );

    // Save history
    // compute result strings in a clearer way (avoid nested ternaries)
    let resultA;
    if (isDraw) resultA = "draw";
    else if (scoreA === 1) resultA = "win";
    else resultA = "loss";

    let resultB;
    if (isDraw) resultB = "draw";
    else if (scoreB === 1) resultB = "win";
    else resultB = "loss";

    await EloHistory.create([
      {
        userId: userA._id,
        opponentId: userB._id,
        before: beforeA,
        after: afterA,
        change: afterA - beforeA,
        result: resultA,
      },
      {
        userId: userB._id,
        opponentId: userA._id,
        before: beforeB,
        after: afterB,
        change: afterB - beforeB,
        result: resultB,
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

    // Also emit a generic 'rating-updated' event for clients that listen for
    // the naming used by the Glicko path. This keeps both handlers working.
    try {
      io.to(roomId).emit("rating-updated", {
        players: [
          { socketId: socketA, before: beforeA, after: afterA },
          { socketId: socketB, before: beforeB, after: afterB },
        ],
      });
    } catch (e) {
      console.error("Failed to emit rating-updated", e);
    }

    return {
      socketA: { before: beforeA, after: afterA },
      socketB: { before: beforeB, after: afterB },
    };
  } catch (err) {
    console.error("ELO update failed", err);
    return null;
  }
}
