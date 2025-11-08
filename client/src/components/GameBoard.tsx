import { useState, useEffect, useRef } from "react";

interface GameBoardProps {
  board: (string | null)[][];
  onCellClick: (row: number, col: number) => void;
  currentTurn: string;
  mySymbol: string;
  isMyTurn: boolean;
  gameStatus: string;
  lockedCells?: [number, number][];
  moveCount?: number;
  validFirstMoveCells?: [number, number][];
  // Optional array of winning cells (row,col) to draw a line over
  winningCells?: [number, number][];
}

const BOARD_SIZE = 17; // enforce a 17x17 board as requested

export default function GameBoard({
  board,
  onCellClick,
  currentTurn,
  isMyTurn,
  gameStatus,
  lockedCells = [],
  moveCount = 0,
  validFirstMoveCells = [],
  winningCells = [],
}: GameBoardProps) {
  const [hoveredCell, setHoveredCell] = useState<[number, number] | null>(null);
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(
    null
  );
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [zoomEnabled, setZoomEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("zcaro-zoom");
      return v === "1";
    } catch {
      return false;
    }
  });

  // pan/zoom state
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const isPanningRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<number | null>(null);

  const clamp = (v: number, a = 1, b = 3) => Math.max(a, Math.min(b, v));

  // listen for zoom preference changes (storage + custom event)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "zcaro-zoom") setZoomEnabled(e.newValue === "1");
    };
    const onCustom = (ev: Event) => {
      try {
        const ce = ev as CustomEvent<boolean>;
        if (typeof ce?.detail === "boolean") setZoomEnabled(ce.detail);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage as unknown as EventListener);
    window.addEventListener("zcaro-zoom-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener(
        "storage",
        onStorage as unknown as EventListener
      );
      window.removeEventListener(
        "zcaro-zoom-changed",
        onCustom as EventListener
      );
    };
  }, []);

  // Reset transforms when zoom disabled
  useEffect(() => {
    if (!zoomEnabled) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [zoomEnabled]);

  // Attach wheel / pointer / touch handlers when component mounts
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!zoomEnabled) return;
      // require ctrl/meta key to avoid interfering with page scroll
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.06 : 0.94;
      setScale((s) => clamp(s * factor));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!zoomEnabled) return;
      // only left button or touch
      if (e.pointerType === "mouse" && e.button !== 0) return;
      isPanningRef.current = true;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!zoomEnabled) return;
      if (!isPanningRef.current || !lastPointRef.current) return;
      const lp = lastPointRef.current;
      const dx = e.clientX - lp.x;
      const dy = e.clientY - lp.y;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!zoomEnabled) return;
      isPanningRef.current = false;
      lastPointRef.current = null;
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    // touch pinch handlers
    const getTouchDist = (t1: Touch, t2: Touch) => {
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (!zoomEnabled) return;
      if (ev.touches.length === 2) {
        pinchStartRef.current = getTouchDist(ev.touches[0], ev.touches[1]);
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (!zoomEnabled) return;
      if (ev.touches.length === 2 && pinchStartRef.current) {
        ev.preventDefault();
        const now = getTouchDist(ev.touches[0], ev.touches[1]);
        const ratio = now / pinchStartRef.current;
        setScale((s) => clamp(s * ratio));
        pinchStartRef.current = now;
      }
    };

    const onTouchEnd = () => {
      pinchStartRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("wheel", onWheel as EventListener);
      el.removeEventListener("pointerdown", onPointerDown as EventListener);
      window.removeEventListener("pointermove", onPointerMove as EventListener);
      window.removeEventListener("pointerup", onPointerUp as EventListener);
      el.removeEventListener("touchstart", onTouchStart as EventListener);
      el.removeEventListener("touchmove", onTouchMove as EventListener);
      el.removeEventListener("touchend", onTouchEnd as EventListener);
    };
  }, [zoomEnabled]);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  // compute container rect for drawing overlay
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const update = () => setContainerRect(el.getBoundingClientRect());
    update();

    // Use ResizeObserver for more robust sizing (handles layout changes)
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    } catch {
      // Fallback to window resize if ResizeObserver not available
      window.addEventListener("resize", update);
    }

    return () => {
      try {
        if (ro && el) ro.unobserve(el);
      } catch {
        /* ignore */
      }
      window.removeEventListener("resize", update);
    };
  }, []);

  // Re-measure when winningCells changes (ensures overlay uses latest dimensions)
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    setContainerRect(el.getBoundingClientRect());
  }, [winningCells]);

  // debug: log when winningCells or containerRect change
  useEffect(() => {
    try {
      console.debug(
        "GameBoard - winningCells:",
        winningCells,
        "containerRect:",
        containerRect
      );
    } catch {
      // ignore
    }
  }, [winningCells, containerRect]);

  // Build a quick lookup set for winning cells so we can highlight exactly those
  const winningSet = new Set<string>(
    (winningCells || []).map(([r, c]) => `${r}-${c}`)
  );

  // Normalize incoming board to a fixed BOARD_SIZE x BOARD_SIZE so rendering
  // is safe even if server sends different dimensions. Missing cells are
  // treated as null (empty).
  const renderedBoard: (string | null)[][] = Array.from(
    { length: BOARD_SIZE },
    (_, r) =>
      Array.from({ length: BOARD_SIZE }, (_, c) => {
        try {
          return board?.[r]?.[c] ?? null;
        } catch {
          return null;
        }
      })
  );

  // Debug
  useEffect(() => {
    if (lockedCells && lockedCells.length > 0) {
      console.log("GameBoard - Locked cells received:", lockedCells);
    }
  }, [lockedCells]);

  // Determine cell value (only actual placed pieces come from renderedBoard).
  // We no longer show a preview piece on hover; selection is performed via
  // click (first click selects a cell, second click confirms the move).
  const getCellContent = (row: number, col: number) => {
    return renderedBoard[row][col] ?? null;
  };

  // no preview opacity function needed — placed pieces are always fully visible

  const isLocked = (row: number, col: number) => {
    return lockedCells.some(([lr, lc]) => lr === row && lc === col);
  };

  const getCellNumber = (row: number, col: number) => {
    return row * BOARD_SIZE + col + 1;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={(el) => {
          gridRef.current = el;
        }}
        className="relative"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          touchAction: zoomEnabled ? "none" : "auto",
          cursor: zoomEnabled && scale > 1 ? "grab" : "default",
        }}
      >
        {/* Previously we drew a polyline and circles to connect winning cells.
            Change: remove connecting line and instead highlight only the exact
            winning cells below so that only those cells "light up". */}

        <div
          className={`game-board-grid grid gap-0 p-2 shadow-2xl`}
          style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}
        >
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, index) => {
            const row = Math.floor(index / BOARD_SIZE);
            const col = index % BOARD_SIZE;
            const isWinning = winningSet.has(`${row}-${col}`);
            const cellValue = getCellContent(row, col);
            const isHovered =
              hoveredCell?.[0] === row && hoveredCell?.[1] === col;
            const isSelected =
              selectedCell?.[0] === row && selectedCell?.[1] === col;
            const isOccupied = renderedBoard[row][col] !== null;
            const cellLocked = isLocked(row, col);
            // If it's the very first move (moveCount === 0) and X must play first,
            // restrict allowed cells to validFirstMoveCells for player X.
            const isFirstMoveRestriction =
              moveCount === 0 && currentTurn === "X";
            const isValidFirstCell = validFirstMoveCells.some(
              ([vr, vc]) => vr === row && vc === col
            );
            const cellNumber = getCellNumber(row, col);

            return (
              <button
                key={`${row}-${col}`}
                className={`
                w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 
                border border-gray-300 
                ${cellLocked ? "bg-black" : "bg-white"}
                flex items-center justify-center relative
                transition-all duration-200
                ${
                  isMyTurn &&
                  !isOccupied &&
                  !cellLocked &&
                  gameStatus === "playing" &&
                  (!isFirstMoveRestriction || isValidFirstCell)
                    ? "hover:bg-amber-200 cursor-pointer"
                    : "cursor-not-allowed"
                }
                ${isHovered && !isOccupied && !cellLocked ? "bg-amber-200" : ""}
              `}
                style={
                  window.innerWidth < 640
                    ? {
                        width: `calc(90vw / ${BOARD_SIZE})`,
                        height: `calc(90vw / ${BOARD_SIZE})`,
                        maxWidth: "44px",
                        maxHeight: "44px",
                      }
                    : {}
                }
                onClick={() => {
                  if (
                    !isMyTurn ||
                    isOccupied ||
                    cellLocked ||
                    gameStatus !== "playing" ||
                    (isFirstMoveRestriction && !isValidFirstCell)
                  ) {
                    return;
                  }

                  // Two-step: first click selects (marks) the cell; second click
                  // on the same cell confirms and sends the move to the server.
                  if (isSelected) {
                    // confirm
                    setSelectedCell(null);
                    onCellClick(row, col);
                    return;
                  }

                  // select new cell
                  setSelectedCell([row, col]);
                }}
                onMouseEnter={() => {
                  if (
                    isMyTurn &&
                    !isOccupied &&
                    !cellLocked &&
                    gameStatus === "playing"
                  ) {
                    setHoveredCell([row, col]);
                  }
                }}
                onMouseLeave={() => setHoveredCell(null)}
                disabled={
                  !isMyTurn ||
                  isOccupied ||
                  cellLocked ||
                  gameStatus !== "playing" ||
                  (isFirstMoveRestriction && !isValidFirstCell)
                }
              >
                {/* Locked cell indicator - brick wall pattern */}
                {cellLocked && (
                  <div
                    className="absolute inset-0"
                    title="Ô cấm"
                    style={{
                      pointerEvents: "none",
                      zIndex: 1,
                      // subtle inner shadow to make the black cell readable
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
                    }}
                  />
                )}

                {/* Selection / hover highlight: show a faint yellow mark when the
                    cell is selected (first click) or hovered. */}
                {(isSelected || isHovered) && !cellLocked && !isOccupied && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundColor: "rgba(255, 235, 135, 0.45)",
                      boxShadow: "inset 0 0 0 2px rgba(255,180,0,0.9)",
                      borderRadius: 6,
                      zIndex: 0,
                      opacity: 1,
                    }}
                  />
                )}

                {/* Winning cell highlight: only render a subtle yellow panel for exact winning cells */}
                {isWinning && !cellLocked && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundColor: "#FFEBB8",
                      boxShadow: "inset 0 0 0 2px #FFB400",
                      borderRadius: 6,
                      zIndex: 0,
                      opacity: 0.96,
                    }}
                  />
                )}

                {/* Cell number (faint gray - darker) - only show when cell is empty */}
                {!cellLocked && !isOccupied && (
                  <span
                    className="absolute text-gray-300 text-[10px] sm:text-xs opacity-70"
                    style={
                      window.innerWidth < 640
                        ? {
                            color: "#c5c6c7", // tương đương text-gray-400
                            opacity: 0.5, // làm nhạt chữ
                            fontWeight: 300, // nhẹ hơn
                            transform: "scale(0.9)", // co nhẹ lại
                            transformOrigin: "center",
                          }
                        : {}
                    }
                  >
                    {cellNumber}
                  </span>
                )}

                {/* Game piece - render as SVG for a thicker, "mập mập" look */}
                {cellValue && (
                  <div className="relative z-10 flex items-center justify-center">
                    {cellValue === "X" ? (
                      <svg
                        viewBox="0 0 100 100"
                        className="w-5 h-5 sm:w-10 sm:h-10 md:w-8 md:h-8"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <line
                          x1="15"
                          y1="15"
                          x2="85"
                          y2="85"
                          stroke="#DC2626"
                          strokeWidth="14"
                          strokeLinecap="round"
                        />
                        <line
                          x1="85"
                          y1="15"
                          x2="15"
                          y2="85"
                          stroke="#DC2626"
                          strokeWidth="14"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 100 100"
                        className="w-6 h-6 sm:w-10 sm:h-10 md:w-10 md:h-10"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="32"
                          fill="none"
                          stroke="#16A34A"
                          strokeWidth="14"
                        />
                      </svg>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* winner banner removed - results are shown via app toasts */}
      </div>
    </div>
  );
}
