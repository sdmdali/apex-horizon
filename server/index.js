const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const readyPlayers = new Map();

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("create-room", (callback) => {
    let code;

    do {
      code = Math.random().toString(36)
        .substring(2, 8).toUpperCase();
    } while (rooms.has(code));

    rooms.set(code, new Set([socket.id]));
    readyPlayers.set(code, new Set());
    socket.join(code);
    socket.data.room = code;

    callback({ success: true, code });
  });

  socket.on("join-room", (code, callback) => {
    code = String(code).trim().toUpperCase();
    const players = rooms.get(code);

    if (!players) {
      return callback({ success: false, message: "Room not found" });
    }

    if (players.size >= 2) {
      return callback({ success: false, message: "Room is full" });
    }

    players.add(socket.id);
    socket.join(code);
    socket.data.room = code;

    io.to(code).emit("players-update", players.size);
    callback({ success: true, code });
  });

  socket.on("player-ready", () => {
  const room = socket.data.room;
  if (!room || !rooms.has(room)) return;

  const players = rooms.get(room);
  const ready = readyPlayers.get(room);

  if (!players || players.size !== 2 || !ready) return;

  ready.add(socket.id);

  io.to(room).emit("ready-update", ready.size);

  if (ready.size === 2) {
    io.to(room).emit("race-countdown", { seconds: 3 });
  }
});
  socket.on("car-move", (state) => {
    const room = socket.data.room;
    if (!room || !rooms.has(room)) return;

    socket.to(room).emit("opponent-move", state);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;

    const players = rooms.get(room);
    if (!players) return;

    players.delete(socket.id);
    socket.to(room).emit("opponent-left");

    if (players.size === 0) {
      rooms.delete(room);
    } else {
      io.to(room).emit("players-update", players.size);
    }

    console.log("Player disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Apex Horizon multiplayer server is running!");
});

server.listen(3001, "0.0.0.0", () => {
  console.log("Multiplayer server running on port 3001");
});