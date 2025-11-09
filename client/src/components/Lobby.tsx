import { useEffect, useState } from "react";
import type { AuthUser } from "./GoogleLogin";
import ChatBox from "./ChatBox";
import socket from "../socket";

type RoomInfo = {
  roomId: string;
  status: string;
  createdAt: number | null;
  isPrivate?: boolean;
  player1: {
    name?: string | null;
    socketId?: string | null;
    avatar?: string | null;
    elo?: number | null;
  } | null;
  player2: {
    name?: string | null;
    socketId?: string | null;
    avatar?: string | null;
    elo?: number | null;
  } | null;
  spectators: number;
};

interface LobbyProps {
  onFindMatch: (playerName: string) => void;
  onCreateRoom: (playerName: string, roomId: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
  onSpectateRoom?: (roomId: string, playerName: string) => void;
  isWaiting: boolean;
  onCancelMatchmaking: () => void;
  user?: AuthUser | null;
  mySocketId?: string;
  // header handles sign in/out globally
}

export default function Lobby({
  onCreateRoom,
  onFindMatch,
  onJoinRoom,
  onSpectateRoom,
  isWaiting,
  onCancelMatchmaking,
  user,
  mySocketId,
}: LobbyProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const gw = globalThis as unknown as { window?: Window };
  const [language, setLanguage] = useState<string>(() => {
    try {
      if (gw.window === undefined) return "vi";
      return localStorage.getItem("zcaro-lang") || "vi"; // default Vietnamese
    } catch {
      return "vi";
    }
  });

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "zcaro-lang") {
        setLanguage(e.newValue || "vi");
      }
    }
    function onCustom(e: Event) {
      try {
        const ce = e as CustomEvent<string>;
        if (ce?.detail) setLanguage(ce.detail || "vi");
      } catch {
        /* ignore */
      }
    }
    try {
      const gw2 = globalThis as unknown as { window?: Window };
      if (gw2.window !== undefined) {
        (gw2.window as Window).addEventListener(
          "storage",
          onStorage as EventListener
        );
        (gw2.window as Window).addEventListener(
          "zcaro-language-changed",
          onCustom as EventListener
        );
      }
    } catch {
      /* ignore */
    }
    return () => {
      try {
        const gw2 = globalThis as unknown as { window?: Window };
        if (gw2.window !== undefined) {
          (gw2.window as Window).removeEventListener(
            "storage",
            onStorage as EventListener
          );
          (gw2.window as Window).removeEventListener(
            "zcaro-language-changed",
            onCustom as EventListener
          );
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  const translations: Record<string, Record<string, string>> = {
    vi: {
      mustSignInMatch: "Vui lòng đăng nhập bằng Google để ghép trận",
      matchingInProgress: "🔄 Đang ghép trận...",
      matchByElo: "Ghép trận theo ELO",
      findMatch: "🏆 Xếp hạng",
      joinRoom: "🤝 Vào phòng",
      createRoom: "✚ Tạo phòng",
      roomsTab: "Phòng",
      onlinesTab: "Online",
      chatTab: "Chat",
      notFound: "Không tìm thấy",
      roomCodeLabel: "Mã phòng",
      roomCodeTitle: "Mã phòng :",
      host: "Chủ phòng",
      status: "Trạng thái",
      spectators: "Người xem",
      enterBtn: "Vào",
      viewBtn: "Xem",
      introTitle:
        "MỘT SỐ LƯU Ý KHI GIAO LƯU CỜ CARO \n Tham gia group giao lưu TẠI ĐÂY",
      communityTitle: "Tham gia cộng đồng:",
      guest: "Khách",
      createNewRoom: "✚ Tạo phòng mới",
      roomCodeRequired: "Mã phòng (bắt buộc)",
      enterRoomPlaceholder: "Nhập mã phòng...",
      cancel: "Hủy",
      joinRoomTitle: "Vào phòng",
      searchingOpponent: "Đang tìm đối thủ...",
      cancelShort: "Hủy",
    },
    en: {
      mustSignInMatch: "Please sign in with Google to find a match",
      matchingInProgress: "🔄 Matching...",
      matchByElo: "Match by ELO",
      findMatch: "🏆 Ranking",
      joinRoom: "🤝 Join Room",
      createRoom: "✚ Create Room",
      roomsTab: "Rooms",
      onlinesTab: "Onlines",
      chatTab: "Chat",
      notFound: "Not found",
      roomCodeLabel: "Room code",
      roomCodeTitle: "Room code :",
      host: "Host",
      status: "Status",
      spectators: "Spectators",
      enterBtn: "Join",
      viewBtn: "View",
      introTitle:
        "SOME NOTES FOR CARO MATCHES \n Join the community group HERE",
      communityTitle: "Join the community:",
      guest: "Guest",
      createNewRoom: "✚ Create new room",
      roomCodeRequired: "Room code (required)",
      enterRoomPlaceholder: "Enter room code...",
      cancel: "Cancel",
      joinRoomTitle: "Join room",
      searchingOpponent: "Searching for opponent...",
      cancelShort: "Cancel",
    },
  };
  const t = translations[language] || translations.vi;
  const [activeTab, setActiveTab] = useState<"rooms" | "onlines" | "chat">(
    "rooms"
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [createRoomCode, setCreateRoomCode] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<
    {
      socketId: string;
      name?: string;
      avatar?: string | null;
      elo?: number | null;
    }[]
  >([]);
  const [roomsList, setRoomsList] = useState<RoomInfo[]>([]);

  useEffect(() => {
    type RawUser = {
      socketId: string;
      name?: string;
      avatar?: string | null;
      elo?: number | null;
    };
    const handler = ({ users }: { users: RawUser[] }) => {
      if (!Array.isArray(users)) return;
      setOnlineUsers(
        users.map((u) => ({
          socketId: u.socketId,
          name: u.name,
          avatar: u.avatar,
          elo: u.elo ?? null,
        }))
      );
    };

    socket.on("online-users", handler);
    const roomsHandler = (payload: { rooms?: unknown }) => {
      try {
        const { rooms } = payload as { rooms?: unknown };
        console.debug("[Lobby] rooms-list payload:", rooms);
        if (!Array.isArray(rooms)) {
          // record unexpected payload for debugging
          setRoomsList([]);
          setLastRoomsPayload(JSON.stringify(rooms));
          return;
        }
        setLastRoomsPayload(JSON.stringify(rooms.slice(0, 5)));
        setRoomsList(rooms as RoomInfo[]);
      } catch (err) {
        console.error("[Lobby] rooms-list handler error", err);
      }
    };
    socket.on("rooms-list", roomsHandler);
    // cleanup
    return () => {
      socket.off("online-users", handler);
      socket.off("rooms-list", roomsHandler);
    };
  }, []);

  // debug: store last raw rooms payload (for investigation when list is empty)
  const [lastRoomsPayload, setLastRoomsPayload] = useState<string | null>(null);

  // Request rooms list when the Rooms tab becomes active
  useEffect(() => {
    if (activeTab === "rooms") {
      try {
        socket.emit("request-rooms");
      } catch {
        /* ignore */
      }
    }
  }, [activeTab]);

  // Track elapsed waiting time (seconds) while matchmaking
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isWaiting) {
      setElapsedSeconds(0);
      timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isWaiting]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header is rendered globally by App */}

      {/* Action Buttons */}
      <div className="w-full max-w-[737.59px] mx-auto px-4">
        <div className="flex justify-center gap-4 mt-6 mb-6">
          {/* Find match by ELO (uses server-side matchmaking based on user's ELO) */}
          <button
            onClick={() => {
              try {
                console.debug(
                  `[${new Date().toISOString()}] Lobby: find-match clicked, user=${
                    user?._id ?? "anonymous"
                  } isWaiting=${isWaiting}`
                );
              } catch {
                /* ignore */
              }
              if (!user) return setShowJoinModal(true);
              onFindMatch(
                user.name || `Player ${Math.random().toString(36).slice(2, 6)}`
              );
            }}
            disabled={!user || isWaiting}
            title={
              !user
                ? t.mustSignInMatch
                : isWaiting
                ? t.matchingInProgress
                : t.matchByElo
            }
            className={`py-3 px-6 rounded-lg text-sm font-semibold transition-colors ${
              user
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-green-200 text-white/60 cursor-not-allowed"
            }`}
          >
            {t.findMatch}
          </button>

          {/* Action Buttons */}
          <button
            onClick={() => setShowJoinModal(true)}
            disabled={!user}
            title={!user ? t.mustSignInMatch : ""}
            className={`py-3 px-8 rounded-lg text-sm font-semibold transition-colors ${
              user
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-blue-200 text-white/60 cursor-not-allowed"
            }`}
          >
            {t.joinRoom}
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            disabled={!user}
            title={!user ? t.mustSignInMatch : ""}
            className={`py-3 px-8 rounded-lg text-sm font-semibold transition-colors ${
              user
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-red-200 text-white/60 cursor-not-allowed"
            }`}
          >
            {t.createRoom}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="w-full max-w-[737.59px] mx-auto px-4">
        <div className="flex w-full justify-between gap-4 mt-6 mb-6">
          <button
            onClick={() => setActiveTab("rooms")}
            className={`px-8 w-1/3 py-3 text-sm font-medium transition-colors ${
              activeTab === "rooms"
                ? "text-gray-900 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.roomsTab}
          </button>
          <button
            onClick={() => setActiveTab("onlines")}
            className={`px-6 w-1/3 py-3 text-sm font-medium transition-colors ${
              activeTab === "onlines"
                ? "text-gray-900 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.onlinesTab}
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-6 w-1/3 py-3 text-sm font-medium transition-colors ${
              activeTab === "chat"
                ? "text-gray-900 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.chatTab}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {/* Centered content with fixed width 737.59px as requested */}
      <div className="w-full max-w-[737.59px] mx-auto px-4 py-2">
        {activeTab === "rooms" && (
          <div>
            {roomsList.length === 0 ? (
              <div className="mb-8">
                <p className="text-gray-500 text-sm">{t.notFound}</p>
                {lastRoomsPayload && (
                  <details className="mt-2 text-xs text-gray-400">
                    {/* <pre className="whitespace-pre-wrap">
                      {lastRoomsPayload}
                    </pre> */}
                  </details>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
                {roomsList.map((r) => (
                  <div
                    key={r.roomId}
                    className="p-4 pr-24 bg-white rounded shadow relative"
                  >
                    <div>
                      <div className="flex items-center justify-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          {r.player1?.avatar ? (
                            <img
                              src={r.player1.avatar}
                              alt={r.player1?.name || t.host}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-semibold">
                              {r.player1?.name
                                ? r.player1.name.charAt(0).toUpperCase()
                                : "C"}
                            </div>
                          )}
                          <div className="text-sm text-gray-500 font-medium">
                            {r.player1?.name || t.host}
                          </div>
                        </div>

                        <div className="text-sm text-gray-400">vs</div>

                        <div className="flex items-center gap-2">
                          {r.player2?.avatar ? (
                            <img
                              src={r.player2.avatar}
                              alt={r.player2?.name || "–"}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-semibold">
                              {r.player2?.name
                                ? r.player2.name.charAt(0).toUpperCase()
                                : "–"}
                            </div>
                          )}
                          <div className="text-sm text-gray-500 font-medium">
                            {r.player2?.name || "–"}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 mt-4">
                        {t.status}: {r.status} • {t.spectators}: {r.spectators}
                      </div>
                    </div>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <button
                        onClick={() => {
                          // If room is private, default to spectate mode for outsiders
                          if (r.isPrivate) {
                            if (user && typeof onSpectateRoom === "function") {
                              onSpectateRoom(r.roomId, user.name || "");
                            } else {
                              // anonymous spectator: just join as spectator client-side by opening join modal
                              setRoomId(r.roomId);
                              setShowJoinModal(true);
                            }
                            return;
                          }

                          if (user) {
                            onJoinRoom(r.roomId, user.name || "");
                          } else {
                            setRoomId(r.roomId);
                            setShowJoinModal(true);
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                      >
                        {r.isPrivate ? t.viewBtn : t.enterBtn}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Introduction as in provided image */}
            <div className="space-y-4 text-start">
              <h2 className="text-lg text-center md:text-lg font-extrabold text-black">
                MỘT SỐ LƯU Ý KHI GIAO LƯU CỜ CARO
              </h2>

              <p className="text-center">
                Tham gia group giao lưu{" "}
                <a
                  href="https://zalo.me/g/tnjqrv764"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-semibold"
                >
                  TẠI ĐÂY
                </a>
              </p>

              <div>
                <ol className="list-decimal pl-6 space-y-3 text-sm text-gray-800">
                  <li>
                    <span className="font-semibold">Luật thi đấu</span>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>
                        Ô trung lập: Có 3 ô trung lập xuất hiện ngẫu nhiên trên
                        bàn cờ. Cả X và O đều không được đi vào ô trung lập.
                      </li>
                      <li>
                        Nước đi đầu tiên: X cần thực hiện nước đi đầu tiên xung
                        quanh ô trung lập.
                      </li>
                      <li>
                        Open 4: Nước đi thứ 2 của X cần cách nước đi đầu tiên ít
                        nhất 4 ô cờ.
                      </li>
                      <li>
                        Chiến thắng: Khi đối thủ hết thời gian hoặc có ít nhất 5
                        quân cờ thẳng hàng.
                      </li>
                    </ul>
                  </li>

                  <li>
                    <span className="font-semibold">Tinh thần và thái độ</span>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>
                        Tham gia cộng đồng với thái độ hòa nhã, thân thiện, và
                        vui vẻ. Luôn luôn đề cao tinh thần tôn trọng, văn minh
                        và lịch sự.
                      </li>
                      <li>
                        Không có hành vi gây khó chịu, xúc phạm hay lăng mạ
                        người khác; tránh nói tục, chửi thề, hay gây mâu thuẫn
                        không đáng có.
                      </li>
                      <li>
                        Tránh spam tin nhắn, quấy rối trong các cuộc trò chuyện
                        nhóm.
                      </li>
                      <li>
                        Nếu có mâu thuẫn, hãy giải quyết một cách ôn hòa và thảo
                        luận riêng tư, tránh làm ảnh hưởng đến không khí chung
                        của cộng đồng.
                      </li>
                      <li>
                        Nghiêm cấm các hành vi vi phạm pháp luật dưới mọi hình
                        thức.
                      </li>
                    </ul>
                  </li>

                  <li>
                    <span className="font-semibold">
                      Quy tắc giao lưu và học hỏi
                    </span>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>
                        Không sử dụng phần mềm hỗ trợ hoặc gian lận trong các
                        ván đấu.
                      </li>
                      <li>
                        Khuyến khích việc chia sẻ kinh nghiệm, chiến thuật chơi
                        cờ, và học hỏi từ nhau.
                      </li>
                      <li>
                        Các vi phạm sẽ bị xử lý nghiêm, bao gồm nhắc nhở, cảnh
                        cáo hoặc loại bỏ khỏi nhóm.
                      </li>
                    </ul>
                  </li>
                </ol>
              </div>

              <p className="italic font-semibold text-sm">
                Các vi phạm sẽ bị xử lý nghiêm, bao gồm nhắc nhở, cảnh cáo hoặc
                loại bỏ khỏi nhóm.
              </p>
            </div>
          </div>
        )}

        {activeTab === "onlines" && (
          <div>
            <div className="mb-4 text-lg text-gray-600">
              {t.onlinesTab}: {onlineUsers.length}
            </div>
            {onlineUsers.length === 0 ? (
              <p className="text-gray-500 text-sm">{t.notFound}</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {onlineUsers.map((u) => (
                  <div
                    key={u.socketId}
                    className="flex items-center gap-3 p-5 bg-white rounded shadow"
                  >
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700 font-semibold">
                        {u.name ? u.name.charAt(0).toUpperCase() : "?"}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        {u.name || t.guest}
                      </div>
                      <div className="text-sm text-gray-500">
                        {u.elo ? `${u.elo}` : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <div>
            {/* Render the shared/global chat here */}
            <ChatBox
              roomId={"global"}
              myName={user?.name}
              mySocketId={mySocketId}
              hideHistoryInRoom={false}
            />
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              {t.createNewRoom}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  {t.roomCodeRequired}
                </label>
                <input
                  type="text"
                  value={createRoomCode}
                  onChange={(e) => setCreateRoomCode(e.target.value)}
                  placeholder={t.enterRoomPlaceholder}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={64}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && createRoomCode.trim()) {
                      onCreateRoom(
                        playerName ||
                          `Player ${Math.random().toString(36).slice(2, 6)}`,
                        createRoomCode.trim()
                      );
                      setShowCreateModal(false);
                      setPlayerName("");
                      setCreateRoomCode("");
                    }
                  }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (!createRoomCode.trim()) return;
                    onCreateRoom(
                      playerName ||
                        `Player ${Math.random().toString(36).slice(2, 6)}`,
                      createRoomCode.trim()
                    );
                    setShowCreateModal(false);
                    setPlayerName("");
                    setCreateRoomCode("");
                  }}
                  disabled={!createRoomCode.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {t.createRoom}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setPlayerName("");
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowJoinModal(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {t.joinRoomTitle}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  {t.roomCodeLabel}
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder={t.enterRoomPlaceholder}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && roomId.trim()) {
                      onJoinRoom(
                        roomId.trim(),
                        playerName ||
                          `Player ${Math.random().toString(36).substr(2, 6)}`
                      );
                      setShowJoinModal(false);
                      setRoomId("");
                    }
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (roomId.trim()) {
                      onJoinRoom(
                        roomId.trim(),
                        playerName ||
                          `Player ${Math.random().toString(36).substr(2, 6)}`
                      );
                      setShowJoinModal(false);
                      setRoomId("");
                      setPlayerName("");
                    }
                  }}
                  disabled={!roomId.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {t.joinRoom}
                </button>
                <button
                  onClick={() => {
                    setShowJoinModal(false);
                    setRoomId("");
                    setPlayerName("");
                  }}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waiting Modal */}
      {isWaiting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-700 text-xl mb-4">
                {t.searchingOpponent}
                <span className="text-sm text-gray-500">
                  ({elapsedSeconds}s)
                </span>
              </p>
              <button
                onClick={onCancelMatchmaking}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition-all duration-200"
              >
                {t.cancelShort}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
