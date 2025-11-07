import { io, Socket } from "socket.io-client";

export const socket: Socket = io("http://localhost:4000", {
  transports: ["websocket"],
});

export default socket;

