import { useEffect, useState, useRef } from "react";
import socket from "../socket";
import GameBoard from "./GameBoard";
import ChatBox from "./ChatBox";

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

  const handleFloatingOverBoard = (fm: {
    id: string;
    sender: string;
    message: string;
    avatar?: string | null;
  }) => {
    // add to list and remove after animation
    setFloatingOverBoard((s) => [...s, fm]);
    setTimeout(() => {
      setFloatingOverBoard((s) => s.filter((x) => x.id !== fm.id));
    }, 5400);
  };

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
  const isOpponentTurn =
    !!opponent &&
    localGameState.currentTurn === opponent.symbol &&
    localGameState.status === "playing";

  // Timers per player (seconds remaining)
  const [timers, setTimers] = useState<Record<TimerKey, number>>(() => ({
    p1: 60,
    p2: 60,
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
    setTimers((t) => ({ ...t, [activeKey]: 60 }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localGameState.currentTurn, localGameState.status]);

  const handleCellClick = (row: number, col: number) => {
    if (isMyTurn && localGameState.status === "playing") {
      onMakeMove(localGameState.roomId, row, col);
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
    <div className="min-h-screen from-sky-200 via-cyan-200 to-blue-200 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Spectators row (if there are more than the two main players) */}
        {(() => {
          const p1id = localGameState.players.player1?.socketId;
          const p2id = localGameState.players.player2?.socketId;
          const spectators = playersInRoom.filter(
            (p) => p.socketId !== p1id && p.socketId !== p2id
          );
          if (spectators.length === 0) return null;
          return (
            <div className="mb-4 bg-white/80 backdrop-blur-lg rounded-xl p-3 border border-blue-200/20">
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
                      {s.avatar ? (
                        <img
                          src={s.avatar}
                          alt={s.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 font-semibold">
                          {(s.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 truncate w-16 text-center">
                        {s.name || (t.guest as string)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Players info: avatars centered with names below, X VS O in middle */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-center">
          {/* Left player */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-24 h-24 bg-white/80 backdrop-blur-lg rounded-full flex items-center justify-center border border-blue-200">
              {myPlayer?.avatar ? (
                <img
                  src={myPlayer.avatar}
                  alt={myPlayer.name}
                  className={`w-24 h-24 rounded-full ${
                    isMyTurn ? "slow-spin" : ""
                  } z-10`}
                />
              ) : (
                <div
                  className={`w-24 h-24 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                    isMyTurn ? "slow-spin" : ""
                  }`}
                >
                  {(localGameState.players.player1?.name || "Bạn")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
              {/* seconds badge over avatar when active */}
              {isMyTurn && (
                <>
                  <div className="absolute inset-0 rounded-full bg-black/60 z-20 pointer-events-none" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                    <div className=" text-white text-3xl font-bold px-2 py-0.5 rounded">
                      {(() => {
                        const p1id = localGameState.players.player1.socketId;
                        const key: TimerKey =
                          myPlayer?.socketId === p1id ? "p1" : "p2";
                        return timers[key] ?? 60;
                      })()}
                    </div>
                  </div>
                </>
              )}
              {/* small timer ring - only when active */}
              {isMyTurn &&
                (() => {
                  const p1id = localGameState.players.player1.socketId;
                  const key: TimerKey =
                    myPlayer?.socketId === p1id ? "p1" : "p2";
                  const secondsLeft = timers[key] ?? 60;
                  const total = 60;
                  const progress = Math.max(
                    0,
                    Math.min(1, secondsLeft / total)
                  );
                  const r = 28;
                  const c = 2 * Math.PI * r;
                  const offset = c * (1 - progress);
                  return (
                    <svg
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 pointer-events-none z-0"
                      viewBox="0 0 64 64"
                    >
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
                      <text
                        x="32"
                        y="36"
                        textAnchor="middle"
                        fontSize="12"
                        fill="#034"
                        fontWeight={700}
                      >
                        {secondsLeft}
                      </text>
                    </svg>
                  );
                })()}
            </div>
            <div className="text-center">
              <div className="text-lg text-gray-500">
                {localGameState.players.player1?.name ||
                  (t.roomOwner as string)}
              </div>
              {/* ELO display */}
              <div className="text-sm text-gray-400">
                {localGameState.players.player1?.elo
                  ? `${localGameState.players.player1.elo} ELO`
                  : ""}
              </div>
            </div>
          </div>

          {/* Middle VS */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-4">
              <div className="text-5xl font-extrabold text-black/80">X</div>
              <img
                src="/vs.webp"
                alt="vs"
                className="w-40 h-20 object-contain"
              />
              <div className="text-5xl font-extrabold text-black/80">O</div>
            </div>
          </div>

          {/* Right player */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-24 h-24 bg-white/80 backdrop-blur-lg rounded-full flex items-center justify-center border border-blue-200">
              {opponent?.avatar ? (
                <img
                  src={opponent.avatar}
                  alt={opponent.name}
                  className={`w-24 h-24 rounded-full ${
                    isOpponentTurn ? "slow-spin" : ""
                  } z-10`}
                />
              ) : (
                <div
                  className={`w-24 h-24 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-bold text-2xl ${
                    isOpponentTurn ? "slow-spin" : ""
                  }`}
                >
                  {(localGameState.players.player2?.name || "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
              {isOpponentTurn && (
                <>
                  <div className="absolute inset-0 rounded-full bg-black/60 z-20 pointer-events-none" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                    <div className="text-white text-3xl font-bold px-2 py-0.5 rounded">
                      {(() => {
                        const p1id = localGameState.players.player1.socketId;
                        const key: TimerKey =
                          opponent?.socketId === p1id ? "p1" : "p2";
                        return timers[key] ?? 60;
                      })()}
                    </div>
                  </div>
                  {(() => {
                    const p1id = localGameState.players.player1.socketId;
                    const key: TimerKey =
                      opponent?.socketId === p1id ? "p1" : "p2";
                    const secondsLeft = timers[key] ?? 60;
                    const total = 60;
                    const progress = Math.max(
                      0,
                      Math.min(1, secondsLeft / total)
                    );
                    const r = 28;
                    const c = 2 * Math.PI * r;
                    const offset = c * (1 - progress);
                    return (
                      <svg
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 pointer-events-none z-0"
                        viewBox="0 0 64 64"
                      >
                        <circle
                          cx="32"
                          cy="32"
                          r={r}
                          strokeWidth="3"
                          stroke="#f3fbff"
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
                          style={{
                            transition: "stroke-dashoffset 0.6s linear",
                          }}
                        />
                        <text
                          x="32"
                          y="36"
                          textAnchor="middle"
                          fontSize="12"
                          fill="#034"
                          fontWeight={700}
                        >
                          {secondsLeft}
                        </text>
                      </svg>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="text-center">
              <div className="text-lg text-gray-500">
                {localGameState.players.player2?.name ||
                  (localGameState.status === "waiting"
                    ? (t.waitingShort as string)
                    : (t.opponentLabel as string))}
              </div>
              {/* ELO display for opponent (if available) */}
              <div className="text-sm text-gray-400">
                {localGameState.players.player2?.elo
                  ? `${localGameState.players.player2?.elo} ELO`
                  : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Room code removed: not displayed per user request */}

        {/* Game Status */}
        <div className="bg-white/80 backdrop-blur-lg rounded-xl p-4 mb-4 border border-blue-300/30">
          {/* Game Over Message */}
          {localGameState.status === "finished" && (
            <div className="mt-4 backdrop-blur-lg rounded-xl p-6 border border-blue-300/30 text-center">
              <p className="text-blue-700 text-2xl font-bold mb-4">
                {getStatusMessage()}
              </p>
              <div className="flex items-center justify-center gap-4">
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
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-all"
                      title={t.startNew as string}
                    >
                      {t.startNew as string}
                    </button>
                  )}

                <button
                  onClick={() => onLeaveRoom(localGameState.roomId)}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-all"
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
              localGameState.players.player1.socketId === myPlayer.socketId ? (
                <div>
                  <div className="mb-4 flex justify-center">
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
                      className={`bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold py-3 px-8 rounded-lg transition-all ${
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

                  <div className="flex flex-col md:flex-row items-center justify-center gap-3">
                    <p className="text-blue-800 text-lg text-center">
                      {t.sharingTip as string}
                    </p>
                  </div>
                </div>
              ) : (
                /* Non-owner: show waiting message */
                <div className="flex flex-col items-center gap-3">
                  <p className="text-blue-800 text-lg font-semibold text-center">
                    {t.waitingOwnerStart as string}
                  </p>
                  <p className="text-sm text-gray-600 text-center">
                    {t.ownerLabel as string}{" "}
                    {localGameState.players.player1?.name ||
                      (t.roomOwner as string)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Game Board + Chat (Chat moved below the board) */}
        <div className="bg-white/80 backdrop-blur-lg rounded-xl p-6 border border-blue-300/30 flex flex-col gap-4 justify-center overflow-x-auto">
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

          {/* ELO table under chat (dynamic list) */}
          <div className="mt-4 bg-white/90 backdrop-blur-lg rounded-xl p-4 border border-blue-200/30">
            <h3 className="text-lg font-semibold text-blue-700 mb-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
