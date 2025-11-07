import { io, Socket } from "socket.io-client";

const isLocal = window.location.hostname === "localhost";
const BASE_URL = isLocal
  ? "http://localhost:4000"
  : "https://zcaro-online.onrender.com";

export const socket: Socket = io(BASE_URL, {
  transports: ["websocket"],
  withCredentials: true,
});

export default socket;
