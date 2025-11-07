# 🎮 ZCaro Online - Game Cờ Caro Online

Dự án game Cờ Caro (Tic-tac-toe) online với Socket.io, cho phép người chơi thi đấu trực tuyến theo thời gian thực.

## ✨ Tính năng

- 🎯 **Chơi online real-time** - Sử dụng Socket.io để đồng bộ game state
- 🔍 **Auto Matchmaking** - Tự động tìm đối thủ
- 🚪 **Tạo phòng riêng** - Tạo phòng với mã code để bạn bè tham gia
- 🎨 **UI đẹp mắt** - Giao diện hiện đại với Tailwind CSS
- 📱 **Responsive** - Hỗ trợ mobile và desktop
- ⚡ **Game logic đầy đủ** - Kiểm tra thắng/thua theo luật Caro (5 quân liên tiếp)

## 🛠️ Công nghệ sử dụng

### Frontend
- React 19 + TypeScript
- Tailwind CSS
- Socket.io-client
- Vite

### Backend
- Node.js + Express
- Socket.io
- MongoDB (optional)

## 📦 Cài đặt

### 1. Cài đặt dependencies cho Server

```bash
cd server
npm install
```

### 2. Cài đặt dependencies cho Client

```bash
cd client
npm install
```

### 3. Cấu hình môi trường (Optional)

Tạo file `.env` trong thư mục `server`:

```env
PORT=4000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/zcaro
```

*Lưu ý: MongoDB là optional. Game có thể hoạt động mà không cần database.*

## 🚀 Chạy dự án

### Terminal 1 - Chạy Server

```bash
cd server
npm run dev
```

Server sẽ chạy tại `http://localhost:4000`

### Terminal 2 - Chạy Client

```bash
cd client
npm run dev
```

Client sẽ chạy tại `http://localhost:5173`

## 🎮 Cách chơi

1. **Mở trình duyệt** và truy cập `http://localhost:5173`
2. **Nhập tên** của bạn (hoặc để trống)
3. Chọn một trong hai cách:
   - **Tìm đối thủ**: Click "Tìm đối thủ" để hệ thống tự động ghép cặp
   - **Vào phòng**: Nhập mã phòng để tham gia phòng có sẵn
4. **Chơi game**: 
   - Player 1 (X) đi trước
   - Click vào ô trên bàn cờ để đặt quân
   - Thắng khi có 5 quân liên tiếp (ngang, dọc, hoặc chéo)

## 📁 Cấu trúc dự án

```
zcaro-online/
├── client/                 # Frontend React app
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── GameBoard.tsx
│   │   │   ├── GameRoom.tsx
│   │   │   └── Lobby.tsx
│   │   ├── App.tsx        # Main app component
│   │   └── socket.ts      # Socket.io client
│   └── package.json
│
├── server/                 # Backend Node.js app
│   ├── src/
│   │   ├── gameLogic.js   # Game logic (check winner, etc)
│   │   └── gameManager.js # Game state management
│   ├── index.js           # Express + Socket.io server
│   └── package.json
│
└── README.md
```

## 🎯 Game Logic

- **Bàn cờ**: 15x15 ô
- **Luật thắng**: Người chơi thắng khi có 5 quân liên tiếp (ngang, dọc, hoặc chéo)
- **Player 1**: Đi quân X (màu xanh)
- **Player 2**: Đi quân O (màu đỏ)

## 🔧 Socket Events

### Client → Server
- `find-match` - Tìm đối thủ
- `join-room` - Tham gia phòng
- `make-move` - Đi quân
- `leave-room` - Rời phòng
- `cancel-matchmaking` - Hủy tìm đối thủ

### Server → Client
- `room-joined` - Đã tham gia phòng
- `game-started` - Game bắt đầu
- `move-made` - Quân đã được đặt
- `opponent-left` - Đối thủ rời phòng
- `move-error` - Lỗi khi đi quân

## 📝 License

MIT

## 👨‍💻 Tác giả

Được phát triển bởi bạn! 🚀

