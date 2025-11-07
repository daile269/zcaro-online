// Game logic for Caro/Tic-tac-toe
export const BOARD_SIZE = 20; // Use a 20x20 board

export function createEmptyBoard() {
  return Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(null));
}

// Generate 3 locked cells forming a triangle in the center of the board
export function generateLockedCells() {
  // Place three locked cells around the center but spaced apart
  // Choose a few offsets so the locked cells form a loose triangle similar to the reference
  const center = Math.floor(BOARD_SIZE / 2);
  const offsets = [
    [-4, +2], // upper-right of center
    [-1, -5], // upper-left of center
    [+4, +1], // lower-right of center
  ];

  const cells = offsets.map(([dr, dc]) => [center + dr, center + dc]);

  // Safety: ensure cells are within bounds
  return cells.filter(
    ([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE
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
