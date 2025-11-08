import { useState, useEffect, useRef } from "react";
import "./App.css";
import socket from "./socket";
import Lobby from "./components/Lobby";
import GameRoom from "./components/GameRoom";
import Header from "./components/Header";
import Toasts from "./components/Toast";
import type { ToastItem } from "./components/Toast";
import type { AuthUser } from "./components/GoogleLogin";

interface GameState {
  roomId: string;
  board: (string | null)[][];
  players: {
    player1: { id: string; socketId: string; symbol: string; name?: string };
    player2: {
      id: string;
      socketId: string;
      symbol: string;
      name?: string;
    } | null;
  };
  currentTurn: string;
  status: string;
  winner: string | null;
  lockedCells?: [number, number][];
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem("zcaro_user");
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [mySocketId, setMySocketId] = useState<string>("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const stickyToastRef = useRef<string | null>(null);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    console.debug("addToast ->", message, type);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const t: ToastItem = { id, message, type };
    setToasts((s) => [t, ...s]);
    // auto remove
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
    }, 3500);
  };

  // Persisted setter: keep last room id in localStorage so refresh can restore
  const setPersistedGameState = (gs: GameState | null) => {
    setGameState(gs);
    try {
      if (gs && gs.roomId) {
        localStorage.setItem("zcaro_last_room", gs.roomId);
        // also persist in URL query param for deep link / refresh
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("room", gs.roomId);
          window.history.replaceState({}, "", url.toString());
        } catch {
          // ignore URL errors
        }
      } else {
        localStorage.removeItem("zcaro_last_room");
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("room");
          window.history.replaceState({}, "", url.toString());
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  };

  const removeToast = (id: string) => {
    setToasts((s) => s.filter((t) => t.id !== id));
  };

  useEffect(() => {
    // Get socket ID
    socket.on("connect", () => {
      if (socket.id) {
        setMySocketId(socket.id);
        console.log("Connected:", socket.id);
        // If we have a logged-in user, identify the socket with server
        if (user?._id) {
          socket.emit("identify", { userId: user._id });
        }
        // If there's a room in the URL query (deep link) prefer that, else fallback to localStorage
        try {
          const url = new URL(window.location.href);
          const roomFromUrl = url.searchParams.get("room");
          const last = roomFromUrl || localStorage.getItem("zcaro_last_room");
          if (last) {
            socket.emit("request-room-state", { roomId: last });
          }
        } catch {
          // ignore
        }
      }
    });

    // Set initial socket ID if already connected
    if (socket.id) {
      setMySocketId(socket.id);
    }

    // Handle room created
    socket.on(
      "room-created",
      ({
        gameState: newGameState,
      }: {
        roomId: string;
        gameState: GameState;
      }) => {
        setPersistedGameState(newGameState);
        setIsWaiting(true);
        addToast(`Tạo phòng thành công: ${newGameState.roomId}`, "success");
      }
    );

    // Handle room joined
    socket.on(
      "room-joined",
      ({ gameState: newGameState }: { gameState: GameState }) => {
        setPersistedGameState(newGameState);
        setIsWaiting(true);
      }
    );

    // Handle game started
    socket.on(
      "game-started",
      ({ gameState: newGameState }: { gameState: GameState }) => {
        setPersistedGameState(newGameState);
        setIsWaiting(false);
        console.debug(
          "socket event game-started",
          (newGameState as unknown as Record<string, unknown>)["winningCells"]
        );
        // show a persistent toast while the match is active
        // remove any previous sticky toast
        if (stickyToastRef.current) {
          setToasts((s) => s.filter((x) => x.id !== stickyToastRef.current));
          stickyToastRef.current = null;
        }
        const sid =
          Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const t = {
          id: sid,
          message: "Trận đấu đã bắt đầu",
          type: "info",
        } as ToastItem;
        setToasts((s) => [t, ...s]);
        stickyToastRef.current = sid;
      }
    );

    // Handle waiting for match
    socket.on("waiting-for-match", () => {
      setIsWaiting(true);
    });

    // Handle matchmaking cancelled
    socket.on("matchmaking-cancelled", () => {
      setIsWaiting(false);
    });

    // Handle move made
    socket.on(
      "move-made",
      ({ gameState: newGameState }: { gameState: GameState }) => {
        setPersistedGameState(newGameState);
        console.debug(
          "socket event move-made",
          (newGameState as unknown as Record<string, unknown>)["winningCells"]
        );
      }
    );

    // Handle move error
    socket.on("move-error", ({ error }: { error: string }) => {
      console.error("Move error:", error);
      addToast(error, "error");
    });

    // Handle opponent left
    socket.on("opponent-left", () => {
      addToast("Đối thủ đã rời phòng!", "info");
      setPersistedGameState(null);
      setIsWaiting(false);
    });

    // Handle room full
    socket.on("room-full", ({ message }: { message: string }) => {
      addToast(message || "Phòng đã đầy", "error");
    });

    // Handle room not found
    socket.on("room-not-found", ({ message }: { message: string }) => {
      addToast(message || "Mã phòng không tồn tại", "error");
    });

    // Handle room exists (when trying to create a room with a taken code)
    socket.on("room-exists", ({ message }: { message: string }) => {
      addToast(message || "Mã phòng đã tồn tại", "error");
    });

    // Handle game ended (server-side forfeit / timeout or normal end)
    socket.on(
      "game-ended",
      ({ gameState: newGameState }: { gameState: GameState }) => {
        console.debug("socket event game-ended received", newGameState);
        setPersistedGameState(newGameState);
        // remove any persistent "game started" toast
        if (stickyToastRef.current) {
          removeToast(stickyToastRef.current);
          stickyToastRef.current = null;
        }
        // show a generic end-of-game toast
        addToast("Trận đấu đã kết thúc", "info");
      }
    );

    // Handle start-game errors
    socket.on("start-error", ({ message }: { message: string }) => {
      addToast(message || "Không thể bắt đầu ván", "error");
    });

    // Handle auth-required (server telling client they must sign in)
    socket.on("auth-required", ({ message }: { message: string }) => {
      addToast(
        message || "Bạn cần đăng nhập để thực hiện hành động này",
        "error"
      );
    });

    // Identification results
    socket.on("identified", () => {
      addToast("Đăng nhập thành công", "success");
    });
    socket.on("identify-failed", ({ error }: { error: string }) => {
      addToast(error || "Xác thực thất bại", "error");
    });

    // Room joined success (show a quick toast)
    socket.on("room-joined", () => {
      addToast("Vào phòng thành công", "success");
    });

    // Response to a requested room state (used after page refresh)
    socket.on(
      "room-state",
      ({ gameState: newGameState }: { gameState: GameState }) => {
        if (newGameState) setPersistedGameState(newGameState);
      }
    );

    return () => {
      socket.off("connect");
      socket.off("room-created");
      socket.off("room-joined");
      socket.off("game-started");
      socket.off("auth-required");
      socket.off("game-ended");
      socket.off("start-error");
      socket.off("waiting-for-match");
      socket.off("matchmaking-cancelled");
      socket.off("move-made");
      socket.off("move-error");
      socket.off("opponent-left");
      socket.off("room-full");
      socket.off("room-not-found");
      socket.off("room-exists");
      socket.off("identified");
      socket.off("identify-failed");
      socket.off("room-state");
    };
  }, [user]);

  // handle sign in from GoogleLogin component
  const handleSignIn = (u: AuthUser) => {
    setUser(u);
  };

  const handleSignOut = () => {
    localStorage.removeItem("zcaro_user");
    setUser(null);
  };

  const handleFindMatch = (playerName: string) => {
    try {
      console.debug(
        `[${new Date().toISOString()}] CLIENT emit find-match -> ${playerName} socket=${
          socket.id
        }`
      );
    } catch {
      /* ignore */
    }
    socket.emit("find-match", { playerName });
  };

  const handleCreateRoom = (playerName: string, roomId: string) => {
    const name = user?.name || playerName;
    socket.emit("create-room", { playerName: name, roomId });
  };

  const handleJoinRoom = (roomId: string, playerName: string) => {
    const name = user?.name || playerName;
    socket.emit("join-room", { roomId, playerName: name });
  };

  const handleCancelMatchmaking = () => {
    socket.emit("cancel-matchmaking");
    setIsWaiting(false);
  };

  const handleMakeMove = (roomId: string, row: number, col: number) => {
    socket.emit("make-move", { roomId, row, col });
  };

  const handleLeaveRoom = (roomId: string) => {
    socket.emit("leave-room", { roomId });
    setPersistedGameState(null);
    setIsWaiting(false);
  };

  const handleGoHome = () => {
    // Clear any current room and remove room param from URL
    setPersistedGameState(null);
    setIsWaiting(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <Header
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onHome={handleGoHome}
      />

      {gameState ? (
        <GameRoom
          gameState={gameState}
          mySocketId={mySocketId}
          onMakeMove={handleMakeMove}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <Lobby
          onFindMatch={handleFindMatch}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          isWaiting={isWaiting}
          onCancelMatchmaking={handleCancelMatchmaking}
          user={user}
          mySocketId={mySocketId}
        />
      )}

      {/* Toasts - always mounted so in-game notifications appear */}
      <Toasts toasts={toasts} onRemove={removeToast} />
    </>
  );
}

export default App;
