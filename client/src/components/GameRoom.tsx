import { useEffect, useState, useRef } from "react";
import socket from "../socket";
import GameBoard from "./GameBoard";
import ChatBox from "./ChatBox";
import Toasts from "./Toast";
import type { ToastItem } from "./Toast";

interface Player {
  id: string;
  socketId: string;
  symbol: string;
  name?: string;
  avatar?: string | null;
  elo?: number;
}

interface GameState {
  roomId: string;
  board: (string | null)[][];
  players: {
    player1: Player;
    player2: Player | null;
  };
  currentTurn: string;
  status: string;
  winner: string | null;
  lockedCells?: [number, number][];
  moveCount?: number;
  validFirstMoveCells?: [number, number][];
  winningCells?: [number, number][];
}

type TimerKey = "p1" | "p2";

interface GameRoomProps {
  gameState: GameState;
  mySocketId: string;
  onMakeMove: (roomId: string, row: number, col: number) => void;
  onLeaveRoom: (roomId: string) => void;
}

export default function GameRoom(props: Readonly<GameRoomProps>) {
  const { gameState, mySocketId, onMakeMove, onLeaveRoom } = props;
  const [language, setLanguage] = useState<"vi" | "en">(() => {
    try {
      const v = localStorage.getItem("zcaro-lang");
      return v === "en" ? "en" : "vi";
    } catch {
      return "vi";
    }
  });

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "zcaro-lang") {
        setLanguage(ev.newValue === "en" ? "en" : "vi");
      }
    };
    const onCustom = () => {
      try {
        const v = localStorage.getItem("zcaro-lang") ?? "vi";
        setLanguage(v === "en" ? "en" : "vi");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage as unknown as EventListener);
    window.addEventListener(
      "zcaro-language-changed",
      onCustom as EventListener
    );
    return () => {
      window.removeEventListener(
        "storage",
        onStorage as unknown as EventListener
      );
      window.removeEventListener(
        "zcaro-language-changed",
        onCustom as EventListener
      );
    };
  }, []);

  const translations: Record<string, Record<string, unknown>> = {
    vi: {
      waitingOpponent: "Đang chờ đối thủ...",
      draw: "Hòa!",
      gameEnded: "Trò chơi đã kết thúc",
      you: "Bạn",
      winnerLabel: "Người thắng",
      loserLabel: "Người thua",
      turnYour: (s: string) => `Lượt của bạn (${s})`,
      turnOpponent: (s: string) => `Lượt của đối thủ (${s})`,
      spectators: (n: number) => `Người xem (${n}):`,
      guest: "Khách",
      roomCode: "Mã phòng:",
      copyTitle: "Sao chép mã phòng",
      copyButton: "📋 Sao chép",
      copied: "Đã sao chép",
      startNew: "▶ Bắt đầu ván mới",
      leaveRoom: "Rời phòng",
      cannotStart: "Không thể bắt đầu: chưa có đối thủ",
      startGame: "▶ Bắt đầu trò chơi",
      noOpponent: "Chưa có đối thủ",
      sharingTip: "💡 Chia sẻ mã phòng cho bạn bè để họ tham gia cùng bạn!",
      waitingOwnerStart: "Đang chờ chủ phòng bắt đầu trò chơi...",
      ownerLabel: "Chủ phòng:",
      eloTitle: "ELO người chơi trong phòng",
      tableNoPlayersRow: "Chưa có người chơi",
      playerName: "Tên người chơi",
      symbol: "Ký hiệu",
      elo: "ELO",
      roomOwner: "Chủ phòng",
      opponentLabel: "Đối thủ",
      waitingShort: "Đang chờ...",
      startButtonTitle: "Bắt đầu trò chơi",
    },
    en: {
      waitingOpponent: "Waiting for opponent...",
      draw: "Draw!",
      gameEnded: "Game finished",
      you: "You",
      winnerLabel: "Winner",
      loserLabel: "Loser",
      turnYour: (s: string) => `Your turn (${s})`,
      turnOpponent: (s: string) => `Opponent's turn (${s})`,
      spectators: (n: number) => `Spectators (${n}):`,
      guest: "Guest",
      roomCode: "Room code:",
      copyTitle: "Copy room code",
      copyButton: "📋 Copy",
      copied: "Copied",
      startNew: "▶ Start new round",
      leaveRoom: "Leave room",
      cannotStart: "Can't start: no opponent",
      startGame: "▶ Start game",
      noOpponent: "No opponent yet",
      sharingTip: "💡 Share the room code with friends so they can join you!",
      waitingOwnerStart: "Waiting for the owner to start the game...",
      ownerLabel: "Owner:",
      eloTitle: "Player ELOs in room",
      tableNoPlayersRow: "No players",
      playerName: "Player name",
      symbol: "Symbol",
      elo: "ELO",
      roomOwner: "Owner",
      opponentLabel: "Opponent",
      waitingShort: "Waiting...",
      startButtonTitle: "Start game",
    },
  };

  const t =
    (translations[language] as Record<string, unknown>) ||
    (translations.vi as Record<string, unknown>);
  const [localGameState, setLocalGameState] = useState(gameState);

  // Keep local copy of gameState in sync with prop updates coming from parent/socket events.
  // Without this sync, the component keeps the initial state and won't reflect joins/start
  // emitted by the server (which caused the Start button to remain disabled).
  useEffect(() => {
    setLocalGameState(gameState);
  }, [gameState]);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [floatingOverBoard, setFloatingOverBoard] = useState<
    { id: string; sender: string; message: string; avatar?: string | null }[]
  >([]);

  // draw offer state
  const [drawOfferSent, setDrawOfferSent] = useState(false);
  const [incomingDrawOffer, setIncomingDrawOffer] = useState<{
    fromSocket: string;
    fromName?: string | null;
  } | null>(null);

  // leave room confirmation modal
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // increment this to tell GameBoard to clear optimistic placements
  const [optimisticInvalidateKey, setOptimisticInvalidateKey] = useState(0);
  // selected spectator for profile modal
  const [selectedSpectator, setSelectedSpectator] = useState<Player | null>(
    null
  );
  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((s) => [...s, { id, message, type }]);
  };
  const removeToast = (id: string) =>
    setToasts((s) => s.filter((t) => t.id !== id));

  const handleFloatingOverBoard = (fm: {
    id: string;
    sender: string;
    message: string;
    avatar?: string | null;
  }) => {
    // add to list and remove after animation
    setFloatingOverBoard((s) => [...s, fm]);
    // keep floating messages a bit slower/longer on screen
    setTimeout(() => {
      setFloatingOverBoard((s) => s.filter((x) => x.id !== fm.id));
    }, 8000);
  };

  // Socket listeners for draw offer flow
  useEffect(() => {
    const onDrawOffered = (data: {
      fromSocket: string;
      fromName?: string | null;
      roomId?: string;
    }) => {
      // only show if offer is for this room
      if (data?.roomId !== localGameState.roomId) return;
      setIncomingDrawOffer({
        fromSocket: data.fromSocket,
        fromName: data.fromName,
      });
    };
    const onDrawOfferSent = () => {
      setDrawOfferSent(true);
    };
    const onDrawDeclined = (data: { fromSocket: string; roomId?: string }) => {
      if (data?.roomId !== localGameState.roomId) return;
      // reset sent state and show toast
      setDrawOfferSent(false);
      addToast(
        language === "vi" ? "Lời xin hòa bị từ chối" : "Draw offer declined",
        "error"
      );
    };

    const onGameEnded = (data: { gameState?: GameState; reason?: string }) => {
      try {
        if (!data) return;
        const gs = data.gameState as GameState | undefined;
        if (gs && gs.roomId !== localGameState.roomId) return;
        // If game ended because draw was accepted (or a draw occurred), clear the offer-sent UI
        if (data.reason === "draw-offer-accepted" || gs?.winner === "draw") {
          setDrawOfferSent(false);
        }
      } catch {
        // ignore
      }
    };

    socket.on("draw-offered", onDrawOffered);
    socket.on("draw-offer-sent", onDrawOfferSent);
    socket.on("draw-declined", onDrawDeclined);
    socket.on("game-ended", onGameEnded);

    const onRoomRemoved = (data: { roomId: string; reason?: string }) => {
      if (data?.roomId !== localGameState.roomId) return;
      addToast(
        language === "vi"
          ? "Phòng đã bị đóng (chủ phòng rời đi)."
          : "Room closed (owner left).",
        "error"
      );
      try {
        onLeaveRoom(localGameState.roomId);
      } catch {
        /* ignore */
      }
    };

    socket.on("room-removed", onRoomRemoved);

    // Listen for server-side move validation errors (e.g., Open-4 rule).
    const onMoveError = (payload: { error?: string }) => {
      try {
        const msg =
          payload?.error ||
          (language === "vi"
            ? "OPEN 4: Nước tiếp theo phải cách nước đầu tiên 4 ô"
            : "OPEN 4:The next move must be 4 squares away from the first move.");
        addToast(msg, "error");
        // clear any optimistic placement(s) since server rejected the move
        try {
          setOptimisticInvalidateKey((k) => k + 1);
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    };
    socket.on("move-error", onMoveError);

    return () => {
      socket.off("draw-offered", onDrawOffered);
      socket.off("draw-offer-sent", onDrawOfferSent);
      socket.off("draw-declined", onDrawDeclined);
      socket.off("game-ended", onGameEnded);
      socket.off("room-removed", onRoomRemoved);
      socket.off("move-error", onMoveError);
    };
  }, [localGameState.roomId, language, onLeaveRoom]);

  useEffect(() => {
    const onResize = () => {
      if (boardRef.current) {
        // setBoardHeight(boardRef.current.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  let myPlayer: Player | null = null;
  let opponent: Player | null = null;
  if (localGameState.players.player1.socketId === mySocketId) {
    myPlayer = localGameState.players.player1;
    opponent = localGameState.players.player2;
  } else if (localGameState.players.player2?.socketId === mySocketId) {
    myPlayer = localGameState.players.player2;
    opponent = localGameState.players.player1;
  } else {
    myPlayer = null;
    opponent = null;
  }

  const mySymbol = myPlayer?.symbol || "";
  const isMyTurn =
    localGameState.currentTurn === mySymbol &&
    localGameState.status === "playing";

  // Slot-local players to ensure avatar/name/ELO stay together
  const leftPlayer = localGameState.players.player1 as Player;
  const rightPlayer = localGameState.players.player2 as Player | null;
  const leftIsActive =
    leftPlayer &&
    localGameState.currentTurn === leftPlayer.symbol &&
    localGameState.status === "playing";
  const rightIsActive =
    rightPlayer &&
    localGameState.currentTurn === rightPlayer.symbol &&
    localGameState.status === "playing";

  // Timers per player (seconds remaining)
  // Per-turn time limit (seconds). Changed from 60s to 45s as requested.
  const TURN_SECONDS = 45;

  const [timers, setTimers] = useState<Record<TimerKey, number>>(() => ({
    p1: TURN_SECONDS,
    p2: TURN_SECONDS,
  }));

  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Helper to play a short tick sound
  const playTick = () => {
    try {
      if (!audioCtxRef.current) {
        type AudioCtor = new () => AudioContext;
        const win = globalThis as unknown as {
          AudioContext?: AudioCtor;
          webkitAudioContext?: AudioCtor;
        };
        const Ctor = win.AudioContext ?? win.webkitAudioContext;
        if (Ctor) audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current!;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 1000;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.08);
      setTimeout(() => {
        try {
          o.stop();
          o.disconnect();
          g.disconnect();
        } catch {
          void 0;
        }
      }, 120);
    } catch {
      // ignore audio errors
    }
  };

  // Determine active player key based on current turn symbol
  const getActiveKey = (gs: GameState): TimerKey | null => {
    if (!gs?.players) return null;
    return gs.currentTurn === gs.players.player1.symbol ? "p1" : "p2";
  };

  // Manage ticking timer when it's someone's turn
  useEffect(() => {
    // clear previous timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (localGameState.status !== "playing") return;

    const activeKey = getActiveKey(localGameState);
    if (!activeKey) return;

    // reset the active player's timer to full when a new turn starts
    setTimers((t) => ({ ...t, [activeKey]: TURN_SECONDS }));

    timerRef.current = globalThis.setInterval(() => {
      setTimers((t) => {
        const current = t[activeKey];
        if (current > 0) {
          playTick();
          const updated = { ...t, [activeKey]: current - 1 };
          if (current - 1 <= 0) {
            // emit timeout event (the server will handle awarding win)
            socket.emit("time-expired", { roomId: localGameState.roomId });
            // Optimistically update local UI immediately so player sees result
            setLocalGameState((gs) => {
              if (!gs) return gs;
              const p1 = gs.players.player1;
              const p2 = gs.players.player2;
              if (!p1 || !p2) {
                return { ...gs, status: "finished", winner: null };
              }
              const loserIsP1 = p1.socketId === socket.id;
              const winnerSymbol = loserIsP1 ? p2.symbol : p1.symbol;
              return { ...gs, status: "finished", winner: winnerSymbol };
            });
            // stop interval
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          }
          return updated;
        }
        return t;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [localGameState]);

  const handleCellClick = (row: number, col: number) => {
    if (isMyTurn && localGameState.status === "playing") {
      onMakeMove(localGameState.roomId, row, col);
    }
  };

  const leaveRoomNow = () => {
    try {
      socket.emit("leave-room", { roomId: localGameState.roomId });
    } catch {
      /* ignore */
    }
    try {
      onLeaveRoom(localGameState.roomId);
    } catch {
      /* ignore */
    }
  };

  const confirmLeaveRoom = () => {
    // perform the actual leave and close modal
    try {
      leaveRoomNow();
    } finally {
      setShowLeaveConfirm(false);
    }
  };

  const getStatusMessage = () => {
    if (localGameState.status === "waiting") {
      return t.waitingOpponent as string;
    }
    if (localGameState.status === "finished") {
      if (localGameState.winner === "draw") {
        return t.draw as string;
      }
      // winner is stored as symbol ('X' or 'O')
      const p1 = localGameState.players.player1;
      const p2 = localGameState.players.player2;
      if (!p1 && !p2) return t.gameEnded as string;
      const winnerSymbol = localGameState.winner as string | null;
      let winner: Player | null = null;
      let loser: Player | null = null;
      if (winnerSymbol && p1 && p1.symbol === winnerSymbol) {
        winner = p1;
        loser = p2;
      } else if (winnerSymbol && p2 && p2.symbol === winnerSymbol) {
        winner = p2;
        loser = p1;
      }

      const winnerName = winner
        ? winner.socketId === mySocketId
          ? (t.you as string)
          : winner.name || winner.socketId
        : (t.winnerLabel as string);
      const loserName = loser
        ? loser.socketId === mySocketId
          ? (t.you as string)
          : loser.name || loser.socketId
        : (t.loserLabel as string);

      return `${t.winnerLabel}: ${winnerName} — ${t.loserLabel}: ${loserName}`;
    }
    if (isMyTurn) {
      return (t.turnYour as (s: string) => string)(mySymbol);
    }
    return (t.turnOpponent as (s: string) => string)(opponent?.symbol || "");
  };

  // (previously built opponentLabel) - now we render player2's name directly for spectators

  // Build a players array that supports both older {player1, player2} shape
  // and a possible array sent from server (e.g. players: Player[])
  const playersInRoom: Player[] = (() => {
    const stateVal = localGameState as unknown;
    if (!stateVal || typeof stateVal !== "object") return [];
    const pVal = (stateVal as Record<string, unknown>).players;
    if (!pVal) return [];
    if (Array.isArray(pVal)) return pVal as Player[];
    const arr: Player[] = [];
    if (typeof pVal === "object" && pVal !== null) {
      const maybe = pVal as Record<string, unknown>;
      // legacy shape { player1, player2 }
      if (maybe.player1 && typeof maybe.player1 === "object") {
        arr.push(maybe.player1 as Player);
      }
      if (maybe.player2 && typeof maybe.player2 === "object") {
        arr.push(maybe.player2 as Player);
      }

      // fallback: keyed players object
      if (arr.length === 0) {
        try {
          for (const k of Object.keys(maybe)) {
            const v = maybe[k];
            if (
              v &&
              typeof v === "object" &&
              "socketId" in (v as Record<string, unknown>)
            ) {
              arr.push(v as Player);
            }
          }
        } catch {
          // ignore
        }
      }
    }
    // also append spectators if server provides them on gameState
    try {
      const maybeSpect = (stateVal as Record<string, unknown>).spectators;
      if (Array.isArray(maybeSpect)) {
        for (const s of maybeSpect) {
          if (
            s &&
            typeof s === "object" &&
            "socketId" in (s as Record<string, unknown>)
          ) {
            arr.push(s as Player);
          }
        }
      }
    } catch {
      // ignore
    }
    return arr;
  })();

  return (
    <div className="min-h-screen from-sky-200 via-cyan-200 to-blue-200 pt-4">
      {/* Toasts (top-right) */}
      <Toasts toasts={toasts} onRemove={removeToast} />
      <div className="w-full max-w-[737.59px] mx-auto px-4">
        {/* Players info: avatars centered with names below, X VS O in middle */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-4 mb-4 items-center">
          {/* Left player (player1 slot) */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/80 backdrop-blur-lg rounded-full flex items-center justify-center border border-blue-200">
              {leftPlayer?.avatar ? (
                <img
                  src={leftPlayer.avatar}
                  alt={leftPlayer.name}
                  className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full ${
                    leftIsActive ? "slow-spin filter brightness-75" : ""
                  } z-30`}
                />
              ) : (
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                    leftIsActive ? "slow-spin filter brightness-75" : ""
                  } z-30`}
                >
                  {(leftPlayer?.name || "-").charAt(0).toUpperCase()}
                </div>
              )}
              {/* seconds badge over avatar when active */}
              {leftIsActive && (
                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                  <div className=" text-white text-3xl sm:text-4xl md:text-4xl font-bold px-2 py-0.5 rounded">
                    {(() => {
                      const key: TimerKey = "p1";
                      return timers[key] ?? TURN_SECONDS;
                    })()}
                  </div>
                </div>
              )}
              {/* small timer ring - only when active */}
              {leftIsActive &&
                (() => {
                  const key: TimerKey = "p1";
                  const secondsLeft = timers[key] ?? TURN_SECONDS;
                  const total = TURN_SECONDS;
                  const progress = Math.max(
                    0,
                    Math.min(1, secondsLeft / total)
                  );
                  const r = 28;
                  const c = 2 * Math.PI * r;
                  const offset = c * (1 - progress);
                  return (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none z-40"
                      viewBox="0 0 64 64"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* subtle dark background when active */}
                      <circle
                        cx="32"
                        cy="32"
                        r={r + 2}
                        fill="rgba(0,0,0,0.06)"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r={r}
                        strokeWidth="3"
                        stroke="#eef6fb"
                        fill="transparent"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r={r}
                        strokeWidth="3"
                        stroke="#06b6d4"
                        strokeLinecap="round"
                        fill="transparent"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        style={{ transition: "stroke-dashoffset 0.6s linear" }}
                      />
                    </svg>
                  );
                })()}
            </div>
            <div className="text-center">
              {/* ELO display */}
              <div className="text-lg font-bold text-gray-800">
                {leftPlayer?.elo ? `${leftPlayer.elo}` : ""}
              </div>
            </div>
          </div>

          {/* Middle VS - responsive sizing so it stays aligned on mobile */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-3 sm:gap-4 h-16">
              <div
                className="text-4xl sm:text-5xl font-bold leading-none"
                style={{ color: "#DC2626" }}
                aria-hidden
              >
                X
              </div>
              {/* <img
                src="/vs.png"
                alt="vs"
                className="w-32 sm:w-40 h-14 sm:h-32 object-contain"
              /> */}
              —
              <div
                className="text-4xl sm:text-5xl font-bold leading-none"
                style={{ color: "#16A34A" }}
                aria-hidden
              >
                O
              </div>
            </div>
          </div>

          {/* Right player (player2 slot) */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/80 backdrop-blur-lg rounded-full flex items-center justify-center border border-blue-200">
              {rightPlayer?.avatar ? (
                <img
                  src={rightPlayer.avatar}
                  alt={rightPlayer.name}
                  className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full ${
                    rightIsActive ? "slow-spin" : ""
                  } z-30`}
                />
              ) : (
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-bold text-2xl ${
                    rightIsActive ? "slow-spin" : ""
                  } z-30`}
                >
                  {(rightPlayer?.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              {rightIsActive && (
                <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
                  <div className="text-white text-3xl sm:text-4xl md:text-4xl font-bold px-2 py-0.5 rounded">
                    {(() => {
                      const key: TimerKey = "p2";
                      return timers[key] ?? TURN_SECONDS;
                    })()}
                  </div>
                </div>
              )}
              {rightIsActive &&
                (() => {
                  const key: TimerKey = "p2";
                  const secondsLeft = timers[key] ?? TURN_SECONDS;
                  const total = TURN_SECONDS;
                  const progress = Math.max(
                    0,
                    Math.min(1, secondsLeft / total)
                  );
                  const r = 28;
                  const c = 2 * Math.PI * r;
                  const offset = c * (1 - progress);
                  return (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none z-40"
                      viewBox="0 0 64 64"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <circle
                        cx="32"
                        cy="32"
                        r={r + 2}
                        fill="rgba(0,0,0,0.06)"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r={r}
                        strokeWidth="3"
                        stroke="#eef6fb"
                        fill="transparent"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r={r}
                        strokeWidth="3"
                        stroke="#06b6d4"
                        strokeLinecap="round"
                        fill="transparent"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        style={{ transition: "stroke-dashoffset 0.6s linear" }}
                      />
                    </svg>
                  );
                })()}
            </div>
            <div className="text-center">
              {/* ELO display for opponent (if available) */}
              <div className="text-lg font-bold text-gray-800">
                {rightPlayer
                  ? rightPlayer.elo
                    ? `${rightPlayer.elo}`
                    : ""
                  : language === "vi"
                  ? "Đang chờ..."
                  : "Waiting ..."}
              </div>
            </div>
          </div>
        </div>

        {/* Room code removed: not displayed per user request */}

        {/* Game Board + Chat (Chat moved below the board) */}
        <div className="bg-white/80 backdrop-blur-lg rounded-xl p-4 flex flex-col gap-4 justify-center overflow-x-auto">
          <div ref={boardRef} className="w-full flex justify-center">
            <div className="relative w-full flex justify-center">
              <GameBoard
                board={localGameState.board}
                onCellClick={handleCellClick}
                currentTurn={localGameState.currentTurn}
                mySymbol={mySymbol}
                isMyTurn={isMyTurn}
                gameStatus={localGameState.status}
                lockedCells={localGameState.lockedCells || []}
                moveCount={localGameState.moveCount}
                validFirstMoveCells={localGameState.validFirstMoveCells}
                winningCells={localGameState.winningCells || []}
                optimisticInvalidateKey={optimisticInvalidateKey}
              />

              {/* Floating messages over the board (left side, float to top) */}
              <div className="absolute inset-0 pointer-events-none z-40">
                <div className="board-floating-container">
                  {floatingOverBoard.map((fm, idx) => {
                    const cssVars: React.CSSProperties = {
                      ["--i" as unknown as string]: idx,
                    };
                    const isMe = fm.sender === (myPlayer?.name || "");
                    return (
                      <div
                        key={fm.id}
                        className={`board-float-msg ${isMe ? "me" : ""}`}
                        style={cssVars}
                      >
                        <div className="flex items-center gap-2">
                          {fm.avatar ? (
                            <img
                              src={fm.avatar}
                              alt={fm.sender}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 font-semibold">
                              {fm.sender?.charAt(0)?.toUpperCase()}
                            </div>
                          )}
                          <div className="text-sm">{fm.message}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur-lg rounded-xl mt-4 mb-4 border-blue-300/30">
            {/* Game Over Message */}
            {localGameState.status === "finished" && (
              <div className="mt-4 backdrop-blur-lg rounded-xl p-6 border border-blue-300/30 text-center">
                <p className="text-blue-700 text-sm font-bold mb-4">
                  {getStatusMessage()}
                </p>
                <div className="flex items-center justify-center text-sm gap-4">
                  {myPlayer &&
                    localGameState.players.player1.socketId ===
                      myPlayer.socketId && (
                      <button
                        onClick={() => {
                          // owner can restart the game
                          socket.emit("start-game", {
                            roomId: localGameState.roomId,
                          });
                        }}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-5 rounded-lg transition-all"
                        title={t.startNew as string}
                      >
                        {t.startNew as string}
                      </button>
                    )}

                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-5 rounded-lg transition-all"
                  >
                    {t.leaveRoom as string}
                  </button>
                </div>
              </div>
            )}
            {localGameState.status === "waiting" && (
              <div className="mt-4 bg-yellow-100 border border-yellow-300 rounded-lg p-4">
                {/* If current user is room owner, show start button + share info */}
                {myPlayer &&
                localGameState.players.player1.socketId ===
                  myPlayer.socketId ? (
                  <div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          if (!localGameState.players.player2) {
                            alert(t.cannotStart as string);
                            return;
                          }
                          socket.emit("start-game", {
                            roomId: localGameState.roomId,
                          });
                        }}
                        className={`bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold py-2 px-6 rounded-lg transition-all ${
                          !localGameState.players.player2
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        disabled={!localGameState.players.player2}
                        title={
                          localGameState.players.player2
                            ? (t.startButtonTitle as string)
                            : (t.noOpponent as string)
                        }
                      >
                        {t.startGame as string}
                      </button>
                    </div>
                    <div className="flex justify-center mt-2">
                      <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 px-6 rounded-lg"
                      >
                        {t.leaveRoom as string}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Non-owner: show waiting message */
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-blue-800 text-sm font-semibold text-center">
                      {t.waitingOwnerStart as string}
                    </p>
                    <p className="text-sm text-gray-600 text-center">
                      {t.ownerLabel as string}{" "}
                      {localGameState.players.player1?.name ||
                        (t.roomOwner as string)}
                    </p>
                    <div className="mt-2">
                      <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 px-4 rounded-lg"
                      >
                        {t.leaveRoom as string}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Game Status */}

          {/* Playing controls: offer draw button */}
          {localGameState.status === "playing" && myPlayer && opponent && (
            <div className="mb-1 flex justify-center gap-3">
              <button
                onClick={() => {
                  try {
                    socket.emit("offer-draw", {
                      roomId: localGameState.roomId,
                    });
                    setDrawOfferSent(true);
                  } catch {
                    /* ignore */
                  }
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg"
              >
                {language === "vi" ? "Xin hòa" : "Offer draw"}
              </button>
              {drawOfferSent && (
                <div className="text-sm text-gray-500 flex items-center">
                  {language === "vi"
                    ? "Đã gửi lời xin hòa, chờ phản hồi..."
                    : "Draw offer sent, waiting..."}
                </div>
              )}
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg"
              >
                {t.leaveRoom as string}
              </button>
            </div>
          )}

          {/* Incoming draw offer prompt */}
          {incomingDrawOffer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg p-4 max-w-sm w-full shadow-xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                    {/* show initial if no avatar available */}
                    <div className="text-gray-700 font-semibold">
                      {(incomingDrawOffer.fromName || "?").charAt(0)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-gray-800">
                      {incomingDrawOffer.fromName ||
                        (language === "vi" ? "Đối thủ" : "Opponent")}
                    </div>
                    <div className="text-lg text-gray-500">
                      {language === "vi"
                        ? "Đã gửi lời xin hòa"
                        : "offered a draw"}
                    </div>
                  </div>
                  <button
                    onClick={() => setIncomingDrawOffer(null)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label={language === "vi" ? "Đóng" : "Close"}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-4 flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      socket.emit("respond-draw", {
                        roomId: localGameState.roomId,
                        accept: false,
                        fromSocket: incomingDrawOffer.fromSocket,
                      });
                      setIncomingDrawOffer(null);
                      addToast(
                        language === "vi"
                          ? "Bạn đã từ chối lời xin hòa"
                          : "You declined the draw",
                        "info"
                      );
                    }}
                    className="bg-white border border-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded"
                  >
                    {language === "vi" ? "Từ chối" : "Decline"}
                  </button>
                  <button
                    onClick={() => {
                      socket.emit("respond-draw", {
                        roomId: localGameState.roomId,
                        accept: true,
                        fromSocket: incomingDrawOffer.fromSocket,
                      });
                      setIncomingDrawOffer(null);
                      addToast(
                        language === "vi"
                          ? "Đã chấp nhận lời xin hòa"
                          : "You accepted the draw",
                        "success"
                      );
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded"
                  >
                    {language === "vi" ? "Chấp nhận" : "Accept"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Leave room confirmation modal */}
          {showLeaveConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg p-4 max-w-sm w-full shadow-xl border border-blue-100">
                <div className="text-lg font-semibold text-gray-800 mb-2">
                  {language === "vi"
                    ? "Bạn có chắc muốn rời phòng?"
                    : "Are you sure you want to leave the room?"}
                </div>
                <div className="text-sm text-gray-600 mb-4">
                  {language === "vi"
                    ? "Hành động này sẽ khiến bạn rời khỏi phòng hiện tại."
                    : "This will remove you from the current room."}
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="bg-white border border-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded"
                  >
                    {language === "vi" ? "Hủy" : "Cancel"}
                  </button>
                  <button
                    onClick={() => confirmLeaveRoom()}
                    className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded"
                  >
                    {language === "vi" ? "Rời phòng" : "Leave"}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="w-full">
            {/* Use a smaller chat height while a game is playing so the board stays prominent */}
            <ChatBox
              roomId={localGameState.roomId}
              myName={myPlayer?.name}
              mySocketId={mySocketId}
              panelHeight={100}
              onFloating={handleFloatingOverBoard}
              // Hide persisted history for anyone inside the room
              hideHistoryInRoom={true}
            />
          </div>
          {/* Spectators row (if there are more than the two main players) */}
          {(() => {
            const p1id = localGameState.players.player1?.socketId;
            const p2id = localGameState.players.player2?.socketId;
            const spectators = playersInRoom.filter(
              (p) => p.socketId !== p1id && p.socketId !== p2id
            );
            if (spectators.length === 0) return null;
            return (
              <div className="mb-4 bg-white/80 backdrop-blur-lg rounded-xl p-3 border border-blue-600/20">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">
                    {(t.spectators as (n: number) => string)(spectators.length)}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {spectators.map((s) => (
                      <div
                        key={s.socketId || s.id || s.name}
                        className="flex flex-col items-center w-16"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSpectator(s)}
                          title={s.name || (t.guest as string)}
                          className="inline-flex items-center justify-center"
                        >
                          {s.avatar ? (
                            <img
                              src={s.avatar}
                              alt={s.name}
                              className="w-10 h-10 rounded-full object-cover cursor-pointer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 font-semibold cursor-pointer">
                              {(s.name || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Spectator profile modal (opened when clicking an avatar) */}
          {selectedSpectator && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              onClick={() => setSelectedSpectator(null)}
            >
              <div
                className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl border border-blue-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                    {selectedSpectator.avatar ? (
                      <img
                        src={selectedSpectator.avatar}
                        alt={selectedSpectator.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-3xl font-semibold text-gray-700">
                        {(selectedSpectator.name || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="text-lg font-semibold text-gray-800">
                    {selectedSpectator.name || (t.guest as string)}
                  </div>
                  <div className="text-sm text-gray-600">
                    ELO: {selectedSpectator.elo ?? "—"}
                  </div>
                  <div className="mt-2">
                    <button
                      onClick={() => setSelectedSpectator(null)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      {language === "vi" ? "Đóng" : "Close"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ELO table under chat (dynamic list) */}
          {/* <div className="mt-4 bg-white/90 backdrop-blur-lg rounded-xl p-4 border border-blue-200/30">
            <h3 className="text-sm font-semibold text-blue-700 mb-2">
              {t.eloTitle as string}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr>
                    <th className="px-3 py-2">{t.playerName as string}</th>
                    <th className="px-3 py-2">{t.symbol as string}</th>
                    <th className="px-3 py-2">{t.elo as string}</th>
                  </tr>
                </thead>
                <tbody>
                  {playersInRoom.length === 0 ? (
                    <tr className="border-t">
                      <td className="px-3 py-2">
                        {t.tableNoPlayersRow as string}
                      </td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  ) : (
                    playersInRoom.map((p) => (
                      <tr
                        className="border-t"
                        key={p.socketId || p.id || p.name}
                      >
                        <td className="px-3 py-2">{p.name || p.socketId}</td>
                        <td className="px-3 py-2">{p.symbol ?? "—"}</td>
                        <td className="px-3 py-2">{p.elo ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
}
