import { io } from "socket.io-client";

export const socket = io("https://apex-horizon.onrender.com", {
  autoConnect: false,
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  console.log("Connected to multiplayer server:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("Multiplayer connection error:", error.message);
});