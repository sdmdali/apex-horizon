import { io } from "socket.io-client";

export const socket = io("http://10.132.169.92:3001", {
  autoConnect: false
});

socket.on("connect", () => {
  console.log("Connected to multiplayer server:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("Multiplayer connection error:", error.message);
});