// Game logic for Caro/Tic-tac-toe
export const BOARD_SIZE = 17; // Use a 17x17 board (match client GameBoard)

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
  const centerRadius = 5; // widen central box so spacing=5 is more achievable
  const minRow = Math.max(0, center - centerRadius);
  const maxRow = Math.min(BOARD_SIZE - 1, center + centerRadius);
  const minCol = Math.max(0, center - centerRadius);
  const maxCol = Math.min(BOARD_SIZE - 1, center + centerRadius);

  const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const minDistance = 5; // require the locked cells to be at least 5 cells apart (Manhattan)

  // Build list of candidate positions inside the central box
  const candidatesArr = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      candidatesArr.push([r, c]);
    }
  }

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  };

  const maxAttempts = 5000;
  let attempts = 0;

  // Try to pick 3 cells such that each pair has Manhattan distance >= minDistance.
  while (attempts < maxAttempts) {
    attempts++;
    shuffle(candidatesArr);
    const chosen = [];
    for (const pos of candidatesArr) {
      if (chosen.length === 0) {
        chosen.push(pos);
        continue;
      }
      const tooClose = chosen.some((c) => manhattan(c, pos) < minDistance);
      if (!tooClose) chosen.push(pos);
      if (chosen.length === 3) break;
    }
    if (chosen.length === 3) {
      // verify the chosen triple forms a reasonably balanced triangle: all
      // pairwise Manhattan distances should be between minDistance and maxGap
      const d01 = manhattan(chosen[0], chosen[1]);
      const d02 = manhattan(chosen[0], chosen[2]);
      const d12 = manhattan(chosen[1], chosen[2]);
      const maxGap = 9; // allow some variability but avoid wildly uneven sets
      if (
        d01 >= minDistance &&
        d02 >= minDistance &&
        d12 >= minDistance &&
        d01 <= maxGap &&
        d02 <= maxGap &&
        d12 <= maxGap
      ) {
        return chosen;
      }
      // otherwise keep searching
    }
  }

  // Fallback deterministic symmetric placement if random search fails

  const offsets = [
    [0, -5], // left of center
    [5, 0], // below center
    [0, 5], // right of center
  ];
  return offsets
    .map(([dr, dc]) => [center + dr, center + dc])
    .filter(
      ([rr, cc]) => rr >= 0 && rr < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE
    );
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
