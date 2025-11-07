import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import socket from "../socket";

interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
  socketId?: string;
  avatar?: string | null;
}

interface ChatBoxProps {
  roomId: string;
  myName?: string;
  mySocketId?: string;
  panelHeight?: number | null; // height in pixels to match the board
  onFloating?: (fm: {
    id: string;
    sender: string;
    message: string;
    avatar?: string | null;
  }) => void;
  // When true, do not populate or show the full chat history in the list.
  // Ephemeral floating messages may still be shown.
  hideHistoryDuringGame?: boolean;
  // When true, hide chat history for clients that are inside a room (rooms view).
  // This is useful when ChatBox is embedded in a GameRoom and we don't want
  // to show persisted chat messages to in-room users.
  hideHistoryInRoom?: boolean;
}

export default function ChatBox({
  roomId,
  myName,
  mySocketId,
  panelHeight = null,
  onFloating,
  hideHistoryDuringGame = false,
  hideHistoryInRoom = false,
}: Readonly<ChatBoxProps>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [floating, setFloating] = useState<
    {
      id: string;
      sender: string;
      message: string;
      avatar?: string | null;
    }[]
  >([]);
  const [input, setInput] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      if (ev.key === "zcaro-lang")
        setLanguage(ev.newValue === "en" ? "en" : "vi");
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
      placeholder: "Gửi tin nhắn...",
      sendButton: "➤ Gửi",
      playerPrefix: "Người chơi",
      anon: "Khách",
    },
    en: {
      placeholder: "Send a message...",
      sendButton: "➤ Send",
      playerPrefix: "Player",
      anon: "Anon",
    },
  };

  const t =
    (translations[language] as Record<string, unknown>) ||
    (translations.vi as Record<string, unknown>);

  const myDisplayName = myName
    ? myName
    : mySocketId
    ? `${(t.playerPrefix as string) || "Player"} ${mySocketId.slice(0, 6)}`
    : (t.anon as string) || "Anon";

  useEffect(() => {
    // Join the chat room so server will deliver messages and provide history.
    try {
      if (roomId) socket.emit("join-chat-room", { roomId });
    } catch {
      /* ignore */
    }
    const handler = (payload: ChatMessage & { roomId?: string }) => {
      // Only keep messages for this room
      if (!payload.roomId || payload.roomId === roomId) {
        // If history is hidden for this client (either during game or for in-room
        // mode), do not append messages to the persistent list; still show ephemeral floating messages.
        if (!hideHistoryDuringGame && !hideHistoryInRoom) {
          setMessages((m) => [
            ...m,
            {
              sender: payload.sender,
              message: payload.message,
              timestamp: payload.timestamp,
              socketId: payload.socketId,
              avatar: payload.avatar ?? null,
            },
          ]);
        }
        // Add a floating ephemeral message
        const id = `${payload.timestamp}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
        const fm = {
          id,
          sender: payload.sender,
          message: payload.message,
          avatar: payload.avatar ?? null,
        };
        setFloating((f) => [...f, fm]);
        // also notify parent (to float over board) if provided
        if (typeof onFloating === "function") {
          try {
            onFloating(fm);
          } catch {
            /* ignore */
          }
        }
        // remove after animation duration (slightly longer than CSS animation)
        setTimeout(() => {
          setFloating((f) => f.filter((x) => x.id !== id));
        }, 5400);
      }
    };

    socket.on("chat-message", handler);
    // Also listen for full chat history payloads (sent on join or after a clear)
    const historyHandler = (payload: {
      messages: Array<Record<string, unknown>>;
    }) => {
      if (!payload || !Array.isArray(payload.messages)) return;
      // If history is hidden for this client (during game or in-room), ignore the payload
      if (hideHistoryDuringGame || hideHistoryInRoom) return;
      try {
        const mapped = payload.messages.map((m) => ({
          sender: (m.sender as string) || "",
          message: (m.message as string) || "",
          // Normalize timestamp (may be Date object from server)
          timestamp: m.timestamp
            ? new Date(m.timestamp as unknown as string).getTime()
            : Date.now(),
          socketId: (m.socketId as string) || undefined,
          avatar: (m.avatar as string) || null,
        }));
        setMessages(mapped as ChatMessage[]);
      } catch {
        // ignore mapping errors
      }
    };
    socket.on("chat-history", historyHandler);
    return () => {
      socket.off("chat-message", handler);
      socket.off("chat-history", historyHandler);
      // Leave chat room on unmount
      try {
        if (roomId) socket.emit("leave-chat-room", { roomId });
      } catch {
        /* ignore */
      }
    };
  }, [roomId, onFloating, hideHistoryDuringGame, hideHistoryInRoom]);

  // If history was hidden and now becomes visible (e.g., leaving room or game finished),
  // request the latest chat history from the server so the player can see it.
  useEffect(() => {
    if (!hideHistoryDuringGame && !hideHistoryInRoom) {
      try {
        socket.emit("request-chat-history", { roomId });
      } catch {
        /* ignore */
      }
    }
  }, [hideHistoryDuringGame, hideHistoryInRoom, roomId]);

  useEffect(() => {
    // Auto-scroll to bottom on new message
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const payload = {
      roomId,
      message: trimmed,
      sender: myDisplayName,
    };

    socket.emit("chat-message", payload);
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  };
  // Compute styles for scroll behavior
  const containerStyle: CSSProperties = panelHeight
    ? { height: panelHeight }
    : {};

  const messagesStyle: CSSProperties = panelHeight
    ? { maxHeight: Math.max(panelHeight - 120, 120), overflowY: "auto" }
    : { maxHeight: 420, overflowY: "auto" };

  return (
    <div
      className="w-full md:w-90 flex flex-col gap-2 bg-white border border-gray-200 rounded-lg shadow-sm p-3"
      style={containerStyle}
    >
      {/* Chat panel: cap height so chat stays short */}

      {/* Messages area: scrollable, takes available space */}
      <div
        ref={containerRef}
        className="flex-1 space-y-2 pb-2"
        style={messagesStyle}
        aria-live="polite"
      >
        {messages.map((m, idx) => {
          const isMe = m.sender === myDisplayName;
          const wrapperStyle: CSSProperties = {
            display: "flex",
            justifyContent: isMe ? "flex-end" : "flex-start",
          };

          return (
            <div
              key={`${m.timestamp}-${m.socketId ?? idx}`}
              style={wrapperStyle}
            >
              <div
                className={`p-2 rounded flex items-center gap-2 max-w-[80%] ${
                  isMe ? "bg-blue-50 text-right" : "bg-white"
                }`}
              >
                {/* For other users: avatar on left, then content. For me: content then avatar on right */}
                {!isMe &&
                  (m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={m.sender}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 font-semibold">
                      {(m.sender || "?").charAt(0).toUpperCase()}
                    </div>
                  ))}

                <div className="flex-1">
                  <div className="text-xs text-gray-500">{m.sender}</div>
                  <div className="text-sm text-gray-800 break-words">
                    {m.message}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {isMe &&
                  (m.avatar ? (
                    <img
                      src={m.avatar}
                      alt={m.sender}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-700 font-semibold">
                      {(m.sender || "?").charAt(0).toUpperCase()}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating ephemeral messages overlay */}
      <div className="floating-container">
        {floating.map((fm, idx) => {
          const cssVars: React.CSSProperties = {
            ["--i" as unknown as string]: idx,
          };
          const isMe = fm.sender === myDisplayName;
          return (
            <div
              key={fm.id}
              className={`float-msg ${isMe ? "me" : ""}`}
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

      {/* Input area pinned to bottom */}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.placeholder as string}
          className="flex-1 px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"
        >
          {t.sendButton as string}
        </button>
      </div>
    </div>
  );
}
