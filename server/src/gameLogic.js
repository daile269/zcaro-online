// Game logic for Caro/Tic-tac-toe
export const BOARD_SIZE = 20; // Use a 20x20 board

export function createEmptyBoard() {
  return Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(null));
}

// Generate 3 locked cells forming a triangle in the center of the board
export function generateLockedCells() {
  // Randomize three locked cells each call but bias toward the center.
  // Rules:
  // - Choose from a central box around the board center (keeps locked cells "ở giữa").
  // - Ensure the three cells are distinct and spaced apart (manhattan distance >= minDistance).
  // - Retry a number of times before falling back.
  const center = Math.floor(BOARD_SIZE / 2);
  const centerRadius = 4; // how far from center we allow locked cells (tweakable)
  const minRow = Math.max(0, center - centerRadius);
  const maxRow = Math.min(BOARD_SIZE - 1, center + centerRadius);
  const minCol = Math.max(0, center - centerRadius);
  const maxCol = Math.min(BOARD_SIZE - 1, center + centerRadius);

  const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const minDistance = 3; // require a bit more separation between locked cells

  const candidates = new Set();
  const out = [];
  const maxAttempts = 300;
  let attempts = 0;

  while (out.length < 3 && attempts < maxAttempts) {
    attempts++;
    const r = Math.floor(Math.random() * (maxRow - minRow + 1)) + minRow;
    const c = Math.floor(Math.random() * (maxCol - minCol + 1)) + minCol;
    const key = `${r},${c}`;
    if (candidates.has(key)) continue;

    // Ensure new cell isn't too close to existing chosen cells
    const tooClose = out.some((cell) => manhattan(cell, [r, c]) < minDistance);
    if (tooClose) continue;

    candidates.add(key);
    out.push([r, c]);
  }

  // If randomization failed to pick 3 sufficiently separated cells, fall back
  // to a deterministic triangle near the center to avoid returning fewer than 3.
  if (out.length < 3) {
    const center = Math.floor(BOARD_SIZE / 2);
    const offsets = [
      [-4, +2], // upper-right of center
      [-1, -5], // upper-left of center
      [+4, +1], // lower-right of center
    ];
    return offsets
      .map(([dr, dc]) => [center + dr, center + dc])
      .filter(
        ([rr, cc]) => rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE
      );
  }

  return out;
}

// Get cells around locked cells (valid first move positions)
export function getValidFirstMoveCells(lockedCells) {
  const validCells = new Set();
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  lockedCells.forEach(([row, col]) => {
    directions.forEach(([dr, dc]) => {
      const newRow = row + dr;
      const newCol = col + dc;
      if (
        newRow >= 0 &&
        newRow < BOARD_SIZE &&
        newCol >= 0 &&
        newCol < BOARD_SIZE
      ) {
        // Check if this cell is not a locked cell
        const isLocked = lockedCells.some(
          ([lr, lc]) => lr === newRow && lc === newCol
        );
        if (!isLocked) {
          validCells.add(`${newRow},${newCol}`);
        }
      }
    });
  });

  return Array.from(validCells).map((cell) => {
    const [row, col] = cell.split(",").map(Number);
    return [row, col];
  });
}

// Check if a cell is locked
export function isLockedCell(lockedCells, row, col) {
  return lockedCells.some(([lr, lc]) => lr === row && lc === col);
}

export function checkWinner(board, row, col, player) {
  // Returns an array of winning cell coordinates if a win is found, otherwise null
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal \
    [1, -1], // diagonal /
  ];

  for (const [dx, dy] of directions) {
    const cells = [[row, col]]; // include current cell

    // Check in positive direction
    for (let i = 1; i < 5; i++) {
      const newRow = row + dx * i;
      const newCol = col + dy * i;
      if (
        newRow >= 0 &&
        newRow < BOARD_SIZE &&
        newCol >= 0 &&
        newCol < BOARD_SIZE &&
        board[newRow][newCol] === player
      ) {
        cells.push([newRow, newCol]);
      } else {
        break;
      }
    }

    // Check in negative direction
    for (let i = 1; i < 5; i++) {
      const newRow = row - dx * i;
      const newCol = col - dy * i;
      if (
        newRow >= 0 &&
        newRow < BOARD_SIZE &&
        newCol >= 0 &&
        newCol < BOARD_SIZE &&
        board[newRow][newCol] === player
      ) {
        // unshift to keep order from negative -> positive
        cells.unshift([newRow, newCol]);
      } else {
        break;
      }
    }

    if (cells.length >= 5) {
      return cells;
    }
  }

  return null;
}

export function isBoardFull(board) {
  return board.every((row) => row.every((cell) => cell !== null));
}
