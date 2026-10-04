import { socket } from "./multiplayer";
import React, { useEffect, useRef, useState } from 'react';
import {
  Trophy,
  Gauge,
  Volume2,
  VolumeX,
  Camera,
  RotateCcw,
  Play,
  Pause,
  Flame,
  Flag,
  Sparkles,
  Zap,
  Home,
  Award,
  ChevronRight,
  Clock,
  Compass,
} from 'lucide-react';
import { audio } from './game/audio';
import { GameTelemetry, RacingEngine } from './game/engine';
import { CIRCUIT_SVG_PATH, RADAR_START_LINE } from './game/track';

const CAR_COLORS = [
  { name: 'Apex Blue', hex: 0x0077ff, bg: 'bg-blue-600' },
  { name: 'Rosso Corsa', hex: 0xee2233, bg: 'bg-red-600' },
  { name: 'Venom Lime', hex: 0x00dd66, bg: 'bg-emerald-500' },
  { name: 'Cyber Gold', hex: 0xffaa00, bg: 'bg-amber-500' },
  { name: 'Midnight Violet', hex: 0x9922ee, bg: 'bg-purple-600' },
  { name: 'Stealth Carbon', hex: 0x181a20, bg: 'bg-neutral-800' },
  { name: 'Gulf Orange', hex: 0xf97316, bg: 'bg-orange-500' },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RacingEngine | null>(null);

  const [telemetry, setTelemetry] = useState<GameTelemetry | null>(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [playerName, setPlayerName] = useState('Player');
  const [isMuted, setIsMuted] = useState(false);
  const [cameraModeName, setCameraModeName] = useState<'Chase' | 'Cockpit' | 'Orbit'>('Chase');
  const [showLapSplitsModal, setShowLapSplitsModal] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [isPortrait, setIsPortrait] = useState(false);
  const [multiplayerStatus, setMultiplayerStatus] = useState('');
  const countdownStartedRef = useRef(false);

    const handleStartRace = () => {
    if (engineRef.current) {
      engineRef.current.startRace();
    }
  };

  useEffect(() => {
  const checkOrientation = () => {
    setIsPortrait(window.innerHeight > window.innerWidth);
  };

  checkOrientation();
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);

  return () => {
    window.removeEventListener('resize', checkOrientation);
    window.removeEventListener('orientationchange', checkOrientation);
  };
}, []);

  // Connect to multiplayer server
useEffect(() => {
  console.log("App is running");
  socket.connect();

  return () => {
    socket.disconnect();
  };
}, []);

  // Initialize Racing Engine
  useEffect(() => {
    if (!canvasRef.current) return;

 const engine = new RacingEngine(canvasRef.current, (t) => {
  setTelemetry({ ...t });
}, playerName);

engineRef.current = engine;

return () => {
  engine.dispose();
};
}, [playerName]);

  useEffect(() => {
  const handlePlayersUpdate = (count: number) => {
    setMultiplayerStatus(`${count}/2 players connected`);
  };

  const handleOpponentLeft = () => {
    setMultiplayerStatus("Your opponent left the room.");
  };

  const handleOpponentMove = (data: {
    s: number;
    l: number;
    speed?: number;
  }) => {
    engineRef.current?.setOpponentPosition(data.s, data.l);
  };

  const handleRaceCountdown = (data: { seconds: number }) => {
    if (countdownStartedRef.current) return;
countdownStartedRef.current = true;
    setMultiplayerStatus(`Race starts in ${data.seconds}...`);

    window.setTimeout(() => {
      handleStartRace();
      setMultiplayerStatus("GO!");
    }, data.seconds * 1000);
  };

  socket.on("players-update", handlePlayersUpdate);
  socket.on("opponent-left", handleOpponentLeft);
  socket.on("opponent-move", handleOpponentMove);
  socket.on("race-countdown", handleRaceCountdown);

  return () => {
    socket.off("players-update", handlePlayersUpdate);
    socket.off("opponent-left", handleOpponentLeft);
    socket.off("opponent-move", handleOpponentMove);
    socket.off("race-countdown", handleRaceCountdown);
  };
}, []);
  // Sync Car Color with 3D model
  const handleColorChange = (index: number) => {
    setSelectedColorIndex(index);
    if (engineRef.current) {
      engineRef.current.setPlayerColor(CAR_COLORS[index].hex);
    }
  };



  const handleRestartRace = () => {
    setShowLapSplitsModal(false);
    if (engineRef.current) {
      engineRef.current.restartRace();
    }
  };

  const handleTogglePause = () => {
    if (engineRef.current) {
      engineRef.current.togglePause();
    }
  };

  const handleResumeRace = () => {
    if (engineRef.current) {
      engineRef.current.resumeRace();
    }
  };

  const handleReturnToMenu = () => {
    if (engineRef.current) {
      engineRef.current.returnToMenu();
    }
  };

  const handleCreateRoom = () => {
  if (!socket.connected) {
    setMultiplayerStatus("Connecting to server...");
    socket.connect();
  }

  socket.emit("create-room", (response: {
    success: boolean;
    code?: string;
    message?: string;
  }) => {
    if (response.success && response.code) {
      setRoomCode(response.code);
      setMultiplayerStatus("Room created! Share the code with your friend.");
    } else {
      setMultiplayerStatus(response.message || "Could not create room.");
    }
  });
};

const handleJoinRoom = () => {
  const code = roomInput.trim().toUpperCase();

  if (!code) {
    setMultiplayerStatus("Enter a room code first.");
    return;
  }

  if (!socket.connected) {
    setMultiplayerStatus("Connecting to server...");
    socket.connect();
  }

  socket.emit("join-room", code, (response: {
    success: boolean;
    code?: string;
    message?: string;
  }) => {
    if (response.success && response.code) {
      setRoomCode(response.code);
      setMultiplayerStatus("Joined room! Waiting for the race.");
    } else {
      setMultiplayerStatus(response.message || "Could not join room.");
    }
  });
};
  const handlePlayerReady = () => {
  if (!roomCode) {
    setMultiplayerStatus("Create or join a room first.");
    return;
  }

  socket.emit("player-ready");
  setMultiplayerStatus("Waiting for the other player...");
};

  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audio.setMuted(nextMuted);
  };

  const toggleCamera = () => {
    if (engineRef.current) {
      engineRef.current.cycleCamera();
      if (engineRef.current.cameraMode === 'chase') setCameraModeName('Chase');
      else if (engineRef.current.cameraMode === 'hood') setCameraModeName('Cockpit');
      else setCameraModeName('Orbit');
    }
  };

  const [activeKeys, setActiveKeys] = useState<{ [key: string]: boolean }>({});
  const activePointers = useRef<Map<number, string>>(new Map());
  const [difficulty, setDifficulty] = useState<'AMATEUR' | 'PRO' | 'CHAMPION'>('PRO');

  const handleDifficultyChange = (diff: 'AMATEUR' | 'PRO' | 'CHAMPION') => {
    setDifficulty(diff);
    if (engineRef.current) {
      engineRef.current.setDifficulty(diff);
    }
  };

  // Foolproof Pointer Events for immediate steering with zero stickiness
  const handlePointerAction = (
    key: 'left' | 'right' | 'gas' | 'brake' | 'drift',
    isDown: boolean,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    if (isDown) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      activePointers.current.set(e.pointerId, key);
    } else {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      activePointers.current.delete(e.pointerId);
    }

    if (engineRef.current) {
      engineRef.current.keys[key] = isDown;
      if (isDown && navigator.vibrate) {
        if (key === 'drift') navigator.vibrate(25);
        else if (key === 'brake') navigator.vibrate(15);
      }
    }
    setActiveKeys((prev) => ({ ...prev, [key]: isDown }));
  };

  // Global pointer/touch safety: ensures all controls immediately release
  useEffect(() => {
    const handleGlobalRelease = () => {
      activePointers.current.clear();
      if (engineRef.current) {
        engineRef.current.keys.left = false;
        engineRef.current.keys.right = false;
        engineRef.current.keys.gas = false;
        engineRef.current.keys.brake = false;
        engineRef.current.keys.drift = false;
      }
      setActiveKeys({});
    };

    const onPointerUpWindow = (e: PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size === 0) {
        handleGlobalRelease();
      }
    };

    window.addEventListener('pointerup', onPointerUpWindow);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) handleGlobalRelease();
    });
    window.addEventListener('touchcancel', handleGlobalRelease);
    window.addEventListener('blur', handleGlobalRelease);

    return () => {
      window.removeEventListener('pointerup', onPointerUpWindow);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchcancel', handleGlobalRelease);
      window.removeEventListener('blur', handleGlobalRelease);
    };
  }, []);

  const gameState = telemetry?.gameState || 'MENU';
  const isPaused = telemetry?.isPaused || false;
  const playerRank = telemetry?.playerRank || 1;
  const currentLap = telemetry?.currentLap || 1;
  const totalLaps = telemetry?.totalLaps || 5;
  const speed = telemetry?.speedKmH || 0;
  const topSpeed = telemetry?.topSpeedKmH || 0;
  const gear = telemetry?.gear || 1;
  const rpmRatio = telemetry?.rpmRatio || 0;
  const driftScore = telemetry?.driftScore || 0;
  const isDrifting = telemetry?.isDrifting || false;
  const countdownValue = telemetry?.countdownValue || '';
  const raceTime = telemetry?.raceTime || 0;
  const bestLapTime = telemetry?.bestLapTime || 0;
  const recentSplit = telemetry?.recentLapNotification || null;
  const isWinner = telemetry?.isWinner || false;
  const winnerName = telemetry?.winnerName || 'Winner';
  const isPodium = telemetry?.isPodium || false;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const getRankOrdinal = (r: number) => {
    if (r === 1) return '1st';
    if (r === 2) return '2nd';
    if (r === 3) return '3rd';
    return `${r}th`;
  };

  // Calculate player heading angle in degrees for the directional minimap arrow
  const playerAngleRad = telemetry?.radarData?.player?.angle || 0;
  const playerAngleDeg = (playerAngleRad * 180) / Math.PI;

  return (
    <div className="game-shell relative w-screen min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#070913] select-none text-white font-sans">
       {isPortrait && (
      <div className="fixed inset-0 z-[9999] bg-[#050816] flex items-center justify-center text-white text-center p-6">
        <div>
          <div className="text-5xl mb-4">↻</div>

          <h2 className="text-xl font-black">
            ROTATE YOUR PHONE
          </h2>

          <p className="text-sm text-slate-400 mt-2">
            Please turn your phone sideways to play Apex Horizon.
          </p>
        </div>
      </div>
    )}

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block z-0" />

      {/* TOP HUD BAR (During Countdown & Racing & Finished) */}
      {(gameState === 'RACING' || gameState === 'COUNTDOWN' || gameState === 'FINISHED') && (
        <div className="game-topbar absolute top-0 left-0 w-full z-20 flex justify-between items-start p-3 sm:p-5 pointer-events-none">
          {/* Position & Lap Badges */}
          <div className="flex gap-2 sm:gap-3 pointer-events-auto items-center">
            {/* Rank Card */}
            <div className="bg-[#0a0f1c]/85 backdrop-blur-md border border-cyan-500/30 rounded-xl px-3.5 sm:px-4 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex items-baseline gap-1.5">
              <span className={`text-2xl sm:text-4xl font-black italic tracking-tighter ${
                playerRank === 1 ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]' : 'text-cyan-400'
              }`}>
                {getRankOrdinal(playerRank)}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-400">/ 5</span>
            </div>

            {/* Lap Counter */}
            <div className="bg-[#0a0f1c]/85 backdrop-blur-md border border-white/15 rounded-xl px-3 sm:px-4 py-2 shadow-2xl text-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lap</div>
              <div className="text-base sm:text-2xl font-extrabold text-white">
                {currentLap} <span className="text-xs text-slate-400 font-semibold">/ {totalLaps}</span>
              </div>
            </div>

            {/* Race & Best Lap Time */}
            <div className="hidden sm:flex bg-[#0a0f1c]/85 backdrop-blur-md border border-white/15 rounded-xl px-3.5 py-2 shadow-2xl flex-col justify-center">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>Time</span>
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300">{formatTimer(raceTime)}</div>
            </div>

            {bestLapTime > 0 && (
              <div className="hidden md:flex bg-[#0a0f1c]/85 backdrop-blur-md border border-purple-500/30 rounded-xl px-3 py-2 shadow-2xl flex-col justify-center">
                <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="w-3 h-3 text-purple-400" />
                  <span>Best Lap</span>
                </div>
                <div className="text-xs sm:text-sm font-mono font-bold text-purple-300">{formatTimer(bestLapTime)}</div>
              </div>
            )}
          </div>

          {/* TOP RIGHT: Quick Actions & EXACT HIGH-END CIRCUIT RADAR */}
          <div className="flex items-center gap-2 sm:gap-2.5 pointer-events-auto">
            {/* PAUSE BUTTON */}
            {gameState === 'RACING' && (
              <button
                onClick={handleTogglePause}
                className="p-2 sm:p-2.5 rounded-xl bg-[#0a0f1c]/85 backdrop-blur-md border border-amber-400/40 text-amber-400 hover:text-white hover:bg-amber-500/20 active:scale-95 transition shadow-lg"
                title="Pause Game (ESC or P)"
              >
                <Pause className="w-5 h-5 fill-amber-400" />
              </button>
            )}

            {/* Camera View Switcher */}
            <button
              onClick={toggleCamera}
              className="p-2 sm:p-2.5 rounded-xl bg-[#0a0f1c]/85 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:border-cyan-400 active:scale-95 transition"
              title="Toggle Camera View (C)"
            >
              <Camera className="w-5 h-5 text-cyan-400" />
            </button>

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className="p-2 sm:p-2.5 rounded-xl bg-[#0a0f1c]/85 backdrop-blur-md border border-white/15 text-slate-300 hover:text-white hover:border-cyan-400 active:scale-95 transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
            </button>

            {/* HIGH-END RACING CIRCUIT RADAR MINIMAP */}
            <div className="game-minimap relative w-24 h-24 sm:w-28 sm:h-28 bg-[#070b16]/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)] p-1.5 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                {/* Circuit Track Path - Outer Ambient Glow */}
                <path
                  d={CIRCUIT_SVG_PATH}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="7"
                  strokeOpacity="0.3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Circuit Track Path - Inner Crisp Asphalt Line */}
                <path
                  d={CIRCUIT_SVG_PATH}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Start / Finish Checkered Line Marker */}
                <line
                  x1={RADAR_START_LINE.x - 3}
                  y1={RADAR_START_LINE.y}
                  x2={RADAR_START_LINE.x + 3}
                  y2={RADAR_START_LINE.y}
                  stroke="#fbbf24"
                  strokeWidth="3"
                  strokeLinecap="round"
                />

                {/* AI Racer Dots (Red with halo) */}
                {telemetry?.radarData?.ais?.map((pt, i) => (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r="3.2" fill="#ef4444" stroke="#ffffff" strokeWidth="0.8" />
                  </g>
                ))}

                {/* Player Directional Chevron / Arrow Indicator */}
                {telemetry?.radarData?.player && (
                  <g
                    transform={`translate(${telemetry.radarData.player.x}, ${telemetry.radarData.player.y}) rotate(${playerAngleDeg})`}
                  >
                    {/* Glowing outer pulse ring */}
                    <circle cx="0" cy="0" r="5" fill="#00f0ff" fillOpacity="0.3" />
                    {/* Directional arrowhead pointing in car heading */}
                    <polygon points="0,-5 4,4 0,2 -4,4" fill="#00f0ff" stroke="#ffffff" strokeWidth="0.8" />
                  </g>
                )}
              </svg>

              {/* Radar Corner Tag */}
              <div className="absolute bottom-1 right-1.5 text-[8px] font-mono font-bold text-cyan-400/80 tracking-widest pointer-events-none">
                GP MAP
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECENT LAP SPLIT NOTIFICATION POPUP */}
      {recentSplit && (
        <div className="absolute top-18 sm:top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95">
          <div className={`px-4 py-2 rounded-xl backdrop-blur-md border shadow-2xl flex items-center gap-2.5 ${
            recentSplit.isFastest
              ? 'bg-purple-950/85 border-purple-400 text-purple-200'
              : 'bg-slate-900/85 border-cyan-400/40 text-cyan-200'
          }`}>
            <Flag className={`w-4 h-4 ${recentSplit.isFastest ? 'text-purple-400' : 'text-cyan-400'}`} />
            <span className="font-extrabold text-xs sm:text-sm">
              LAP {recentSplit.lapNumber}: <span className="font-mono">{recentSplit.timeStr}</span>
            </span>
            {recentSplit.isFastest && (
              <span className="text-[10px] font-black uppercase bg-purple-500 text-slate-950 px-1.5 py-0.5 rounded">
                FASTEST
              </span>
            )}
          </div>
        </div>
      )}

      {/* DRIFT SLIP BADGE */}
      <div
        className={`absolute top-28 sm:top-32 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-150 flex flex-col items-center ${
          isDrifting ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}
      >
        <div className="flex items-center gap-1.5 text-amber-400 font-black italic tracking-widest text-lg sm:text-2xl drop-shadow-[0_0_16px_rgba(245,158,11,0.8)]">
          <Flame className="w-6 h-6 text-orange-500 animate-bounce" />
          <span>DRIFT SLIP!</span>
        </div>
        <div className="text-xs sm:text-sm font-bold text-yellow-300 drop-shadow">+{driftScore} PTS</div>
      </div>

      {/* COUNTDOWN OVERLAY */}
      {gameState === 'COUNTDOWN' && countdownValue && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            key={countdownValue}
            className={`text-7xl sm:text-9xl font-black italic tracking-tighter drop-shadow-[0_0_60px_rgba(0,240,255,0.9)] animate-ping duration-700 ${
              countdownValue === 'GO!' ? 'text-emerald-400' : 'text-cyan-300'
            }`}
          >
            {countdownValue}
          </div>
        </div>
      )}

      {/* PRO F1 COCKPIT DIGITAL TELEMETRY DASHBOARD (Centered at bottom, compact for mobile landscape, zero overlap with touch buttons!) */}
      {(gameState === 'RACING' || gameState === 'COUNTDOWN') && (
        <div className="game-dashboard absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center">
          <div className="bg-[#070b16]/90 backdrop-blur-xl border border-cyan-500/35 rounded-xl sm:rounded-2xl px-3 sm:px-5 py-1 sm:py-2 shadow-[0_0_30px_rgba(0,0,0,0.85)] flex flex-col items-center gap-1 min-w-[180px] sm:min-w-[240px]">
            {/* F1 Rev Shift Light LEDs */}
            <div className="w-full flex items-center justify-between gap-1 px-0.5">
              {[...Array(10)].map((_, i) => {
                const lit = rpmRatio >= (i + 1) / 10;
                const isRedline = i >= 8;
                const isMid = i >= 4;
                const ledColor = isRedline ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : isMid ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]';
                return (
                  <div
                    key={i}
                    className={`h-1.5 sm:h-2 flex-1 rounded-xs transition-colors duration-75 ${lit ? ledColor : 'bg-slate-800/80'}`}
                  />
                );
              })}
            </div>

            {/* Speedometer & Gear Display */}
            <div className="flex items-center justify-between w-full gap-2 pt-0.5">
              {/* Gear Box */}
              <div className="flex flex-col items-center bg-cyan-950/70 border border-cyan-400/50 rounded-md sm:rounded-lg px-2 sm:px-2.5 py-0.5 sm:py-1">
                <span className="text-[8px] sm:text-[9px] font-bold text-cyan-400 uppercase tracking-widest leading-none">GEAR</span>
                <span className="text-lg sm:text-2xl font-black text-white leading-none mt-0.5">{gear}</span>
              </div>

              {/* Digital Speedometer */}
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-5xl font-black tracking-tighter text-white tabular-nums drop-shadow-[0_0_20px_rgba(0,240,255,0.6)]">
                  {speed}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-cyan-400 tracking-wider">KM/H</span>
              </div>

              {/* Top Speed Tag */}
              <div className="flex flex-col items-end">
                <span className="text-[8px] sm:text-[9px] font-mono font-semibold text-slate-400 uppercase tracking-wider">TOP</span>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-amber-300">{topSpeed}</span>
              </div>
            </div>

            {/* View Mode Tag */}
            <div className="text-[9px] sm:text-[10px] font-mono text-slate-400 tracking-wider hidden sm:block">
              {cameraModeName} Camera
            </div>
          </div>
        </div>
      )}

{/* MOBILE / ON-SCREEN CONTROLS */}
{(gameState === 'RACING' || gameState === 'COUNTDOWN') && (
  <div
    className="game-controls absolute bottom-3 inset-x-0 z-20 pointer-events-none flex justify-between items-end px-3"
  >
    {/* LEFT + RIGHT */}
    <div className="flex gap-3 pointer-events-auto">

      {/* LEFT */}
      <button
        onPointerDown={(e) => handlePointerAction('left', true, e)}
        onPointerUp={(e) => handlePointerAction('left', false, e)}
        onPointerCancel={(e) => handlePointerAction('left', false, e)}
        style={{
          width: 'clamp(68px, 9vw, 88px)',
          height: 'clamp(68px, 9vw, 88px)',
        }}
        className={`rounded-2xl border backdrop-blur-md flex items-center justify-center text-3xl font-black shadow-xl touch-none select-none ${
          activeKeys['left']
            ? 'bg-cyan-400 text-slate-950 border-white scale-95'
            : 'bg-slate-900/90 text-cyan-300 border-cyan-500/40'
        }`}
      >
        ◀
      </button>

      {/* RIGHT */}
      <button
        onPointerDown={(e) => handlePointerAction('right', true, e)}
        onPointerUp={(e) => handlePointerAction('right', false, e)}
        onPointerCancel={(e) => handlePointerAction('right', false, e)}
        style={{
          width: 'clamp(68px, 9vw, 88px)',
          height: 'clamp(68px, 9vw, 88px)',
        }}
        className={`rounded-2xl border backdrop-blur-md flex items-center justify-center text-3xl font-black shadow-xl touch-none select-none ${
          activeKeys['right']
            ? 'bg-cyan-400 text-slate-950 border-white scale-95'
            : 'bg-slate-900/90 text-cyan-300 border-cyan-500/40'
        }`}
      >
        ▶
      </button>
    </div>

    {/* DRIFT + BRAKE + GAS */}
    <div className="flex gap-2 pointer-events-auto">

      {/* DRIFT */}
      <button
        onPointerDown={(e) => handlePointerAction('drift', true, e)}
        onPointerUp={(e) => handlePointerAction('drift', false, e)}
        onPointerCancel={(e) => handlePointerAction('drift', false, e)}
        style={{
          width: 'clamp(58px, 7vw, 76px)',
          height: 'clamp(72px, 9vw, 88px)',
        }}
        className={`rounded-2xl border backdrop-blur-md flex flex-col items-center justify-center text-xs font-black uppercase shadow-xl touch-none select-none ${
          activeKeys['drift']
            ? 'bg-amber-400 text-slate-950 border-white scale-95'
            : 'bg-amber-600/70 text-amber-200 border-amber-400/50'
        }`}
      >
        <Sparkles className="w-5 h-5 mb-1" />
        <span>DRIFT</span>
      </button>

      {/* BRAKE */}
      <button
        onPointerDown={(e) => handlePointerAction('brake', true, e)}
        onPointerUp={(e) => handlePointerAction('brake', false, e)}
        onPointerCancel={(e) => handlePointerAction('brake', false, e)}
        style={{
          width: 'clamp(58px, 7vw, 76px)',
          height: 'clamp(72px, 9vw, 88px)',
        }}
        className={`rounded-2xl border backdrop-blur-md flex flex-col items-center justify-center text-xs font-black uppercase shadow-xl touch-none select-none ${
          activeKeys['brake']
            ? 'bg-rose-500 text-white border-white scale-95'
            : 'bg-rose-700/70 text-rose-200 border-rose-400/50'
        }`}
      >
        <span>BRAKE</span>
      </button>

      {/* GAS */}
      <button
        onPointerDown={(e) => handlePointerAction('gas', true, e)}
        onPointerUp={(e) => handlePointerAction('gas', false, e)}
        onPointerCancel={(e) => handlePointerAction('gas', false, e)}
        style={{
          width: 'clamp(68px, 9vw, 88px)',
          height: 'clamp(68px, 9vw, 88px)',
        }}
        className={`rounded-2xl border backdrop-blur-md flex flex-col items-center justify-center text-sm font-black uppercase shadow-xl touch-none select-none ${
          activeKeys['gas']
            ? 'bg-emerald-400 text-slate-950 border-white scale-95'
            : 'bg-emerald-600/80 text-emerald-200 border-emerald-400/60'
        }`}
      >
        <Gauge className="w-6 h-6 mb-1" />
        <span>GAS</span>
      </button>

    </div>
  </div>
)}

      {/* WORKING PAUSE MENU OVERLAY */}
      {isPaused && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0a0f1e]/95 border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-[0_0_60px_rgba(0,119,255,0.35)] flex flex-col items-center text-center">
            {/* Header Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Pause className="w-3.5 h-3.5 fill-amber-300" />
              <span>Race Paused</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black italic tracking-tighter text-white mb-4">
              GAME PAUSED
            </h2>

            {/* Current Stats In Pause Menu */}
            <div className="w-full grid grid-cols-3 gap-2 bg-white/5 border border-white/10 rounded-xl p-3 mb-4">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Position</div>
                <div className="text-xl font-black text-cyan-300">{getRankOrdinal(playerRank)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Lap</div>
                <div className="text-xl font-black text-white">{currentLap}/{totalLaps}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Time</div>
                <div className="text-base font-mono font-bold text-amber-300 mt-0.5">{formatTimer(raceTime)}</div>
              </div>
            </div>

            {/* Quick Difficulty Switch */}
            <div className="w-full mb-4 text-left">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Change Difficulty:</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['AMATEUR', 'PRO', 'CHAMPION'] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => handleDifficultyChange(diff)}
                    className={`py-1.5 px-1.5 rounded-lg text-xs font-black transition-all border ${
                      difficulty === diff
                        ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.5)]'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {diff === 'AMATEUR' ? 'Amateur' : diff === 'PRO' ? 'Pro' : 'Champion'}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={handleResumeRace}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black italic text-base uppercase tracking-wider shadow-lg active:scale-98 transition flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>RESUME RACE</span>
              </button>

              <button
                onClick={handleRestartRace}
                className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm uppercase tracking-wider active:scale-98 transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>RESTART RACE</span>
              </button>

              <button
                onClick={handleReturnToMenu}
                className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-rose-950/30 border border-white/10 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 font-semibold text-sm active:scale-98 transition flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                <span>QUIT TO MAIN MENU</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* START MENU MODAL */}
      {gameState === 'MENU' && (
          <div className="fixed inset-0 z-40 bg-gradient-to-t from-slate-950/95 via-slate-950/80 to-transparent backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full bg-[#0a0f1d]/90 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,119,255,0.25)] flex flex-col items-center text-center">
            {/* Header Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-3">
              <Trophy className="w-3.5 h-3.5 text-cyan-400" />
              <span>Next-Gen Arcade GP</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black italic tracking-tighter bg-gradient-to-r from-white via-cyan-300 to-blue-500 bg-clip-text text-transparent drop-shadow">
              APEX HORIZON
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 mb-6">
              Grand Prix Physics • Realistic Handling & Track Radar • 5 Laps
            </p>

            {/* Customization: Car Paint Selector */}
            <div className="mb-3">
  <input
    type="text"
    value={playerName}
    onChange={(e) => setPlayerName(e.target.value)}
    placeholder="Enter your name"
    maxLength={15}
    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm text-center outline-none focus:border-cyan-400"
  />
</div>
            <div className="w-full mb-6 text-left">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                Select Hypercar Livery:
              </label>
              <div className="flex gap-2 justify-center flex-wrap">
                {CAR_COLORS.map((col, idx) => (
                  <button
                    key={col.name}
                    onClick={() => handleColorChange(idx)}
                    className={`w-9 h-9 rounded-full ${col.bg} transition-all border-2 flex items-center justify-center ${
                      selectedColorIndex === idx
                        ? 'border-white scale-110 shadow-[0_0_16px_rgba(255,255,255,0.7)]'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    title={col.name}
                  />
                ))}
              </div>
            </div>

            {/* Race Difficulty Selector */}
            <div className="w-full mb-5 text-left">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Race Difficulty:</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {difficulty === 'AMATEUR' ? 'Casual • Gentle Turns' : difficulty === 'PRO' ? 'Grand Prix • Competitive' : 'Champion • Full Speed & Drift'}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['AMATEUR', 'PRO', 'CHAMPION'] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => handleDifficultyChange(diff)}
                    className={`py-2 px-2 rounded-xl text-xs font-black transition-all border ${
                      difficulty === diff
                        ? diff === 'CHAMPION'
                          ? 'bg-rose-600 text-white border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.6)]'
                          : diff === 'PRO'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.6)]'
                          : 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.6)]'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {diff === 'AMATEUR' ? 'Amateur' : diff === 'PRO' ? '⚡ Pro GP' : '🔥 Champion'}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls Guide */}
            <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3.5 mb-6 text-xs text-slate-300 grid grid-cols-2 gap-2 text-left">
              <div className="flex items-center gap-2">
                <span className="font-mono bg-white/15 px-1.5 py-0.5 rounded text-cyan-300 font-bold">W / ↑</span>
                <span>Gas / Drive</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono bg-white/15 px-1.5 py-0.5 rounded text-cyan-300 font-bold">S / ↓</span>
                <span>Brake / Reverse</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono bg-white/15 px-1.5 py-0.5 rounded text-cyan-300 font-bold">A / D</span>
                <span>Steer Left / Right</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono bg-white/15 px-1.5 py-0.5 rounded text-cyan-300 font-bold">SPACE</span>
                <span>Handbrake Drift</span>
              </div>
            </div>

            {/* MULTIPLAYER ROOM */}
<div className="w-full mb-5 p-4 rounded-xl bg-cyan-950/30 border border-cyan-400/30">
  <div className="text-sm font-black uppercase tracking-wider text-cyan-300 mb-3">
    1v1 Multiplayer
  </div>

  <button
    onClick={handleCreateRoom}
    className="w-full py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-wide transition"
  >
    Create Room
  </button>

  {roomCode && (
    <div className="mt-3 p-3 rounded-lg bg-black/30 border border-cyan-400/30 text-center">
      <div className="text-xs text-slate-400 uppercase tracking-wider">
        Your Room Code
      </div>
      <div className="text-2xl font-black tracking-[0.25em] text-white mt-1">
        {roomCode}
      </div>
    </div>
  )}

  <div className="flex gap-2 mt-3">
    <input
      value={roomInput}
      onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
      placeholder="ENTER ROOM CODE"
      maxLength={6}
      className="min-w-0 flex-1 px-3 py-3 rounded-lg bg-slate-900 border border-white/15 text-white placeholder:text-slate-500 uppercase tracking-wider outline-none focus:border-cyan-400"
    />

    <button
      onClick={handleJoinRoom}
      className="px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold transition"
    >
      Join
    </button>
  </div>

  {multiplayerStatus && (
    <div className="mt-3 text-xs text-cyan-200 text-center">
      {multiplayerStatus}
    </div>
  )}
</div>
            {/* Primary Start Button */}
            <button
              onClick={handlePlayerReady}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 hover:from-cyan-300 hover:to-indigo-500 text-slate-950 font-black italic text-lg uppercase tracking-wider shadow-[0_0_30px_rgba(0,240,255,0.4)] hover:shadow-[0_0_40px_rgba(0,240,255,0.6)] active:scale-98 transition flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950 text-slate-950" />
              <span>START GRAND PRIX</span>
            </button>
          </div>
        </div>
      )}

      {/* GAME OVER / VICTORY PODIUM MODAL */}
      {gameState === 'FINISHED' && (
        <div className="absolute inset-0 z-40 bg-slate-950/92 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full bg-[#0a0f1d] border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-[0_0_70px_rgba(0,240,255,0.35)] flex flex-col items-center text-center my-auto">
            {/* Podium Icon */}
            <div className="relative mb-2">
              <Trophy
                className={`w-16 h-16 ${
                  isWinner
                    ? 'text-yellow-400 drop-shadow-[0_0_24px_rgba(250,204,21,0.9)] animate-pulse'
                    : isPodium
                    ? 'text-cyan-300 drop-shadow-[0_0_18px_rgba(103,232,249,0.7)]'
                    : 'text-slate-400'
                }`}
              />
              {isWinner && (
                <div className="absolute -top-1 -right-1 text-xs bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 rounded-full shadow">
                  #1
                </div>
              )}
            </div>

            <h2 className="text-3xl sm:text-4xl font-black italic tracking-tighter text-white">
  {isWinner
    ? `${winnerName} IS THE GRAND PRIX CHAMPION!`
    : isPodium
    ? `${getRankOrdinal(playerRank)} PLACE PODIUM!`
    : 'RACE FINISHED'}
</h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-5">
              {isWinner
                ? 'Sensational driving! You claimed victory on the podium!'
                : `You finished the 5 laps in ${getRankOrdinal(playerRank)} position!`}
            </p>

            {/* Performance Stats Cards */}
            <div className="w-full grid grid-cols-3 gap-2 bg-white/5 border border-white/10 rounded-xl p-3 mb-5">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Race Time</div>
                <div className="text-sm sm:text-base font-mono font-bold text-cyan-300">
                  {formatTimer(raceTime)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Top Speed</div>
                <div className="text-sm sm:text-base font-black text-amber-300">
                  {topSpeed} <span className="text-[10px] font-normal">KM/H</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Drift PTS</div>
                <div className="text-sm sm:text-base font-black text-yellow-300">{driftScore}</div>
              </div>
            </div>

            {/* Toggle Lap Splits vs Classification */}
            <div className="w-full flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {showLapSplitsModal ? 'Your Lap Splits' : 'Official Classification'}
              </span>
              {telemetry?.lapHistory && telemetry.lapHistory.length > 0 && (
                <button
                  onClick={() => setShowLapSplitsModal(!showLapSplitsModal)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline"
                >
                  {showLapSplitsModal ? 'View Standings' : 'View Lap Splits'}
                </button>
              )}
            </div>

            {/* Lap Splits View */}
            {showLapSplitsModal ? (
              <div className="w-full flex flex-col gap-1.5 mb-5 max-h-48 overflow-y-auto">
                {telemetry?.lapHistory?.map((lap) => (
                  <div
                    key={lap.lapNumber}
                    className={`flex justify-between items-center px-3.5 py-2 rounded-lg text-xs font-semibold ${
                      lap.isFastest
                        ? 'bg-purple-950/60 border border-purple-400 text-purple-200'
                        : 'bg-white/5 border border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-400">Lap {lap.lapNumber}</span>
                      {lap.isFastest && (
                        <span className="text-[9px] font-black uppercase bg-purple-500 text-slate-950 px-1 py-0.5 rounded">
                          FASTEST
                        </span>
                      )}
                    </div>
                    <span className="font-mono">{lap.timeStr}</span>
                  </div>
                ))}
              </div>
            ) : (
              /* Final Leaderboard */
              <div className="w-full flex flex-col gap-1.5 mb-5 max-h-48 overflow-y-auto">
                {telemetry?.leaderboard?.map((r) => (
                  <div
                    key={r.name}
                    className={`flex justify-between items-center px-3.5 py-2 rounded-lg text-xs font-semibold ${
                      r.isPlayer
                        ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.2)]'
                        : 'bg-white/5 border border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${r.rank === 1 ? 'text-amber-400' : 'text-slate-400'}`}>
                        #{r.rank}
                      </span>
                      <span>{r.name}</span>
                      {r.isPlayer && (
                        <span className="text-[9px] font-bold bg-cyan-400 text-slate-950 px-1 rounded">YOU</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400">{r.time}</span>
                      <span className="text-[10px] text-cyan-400/80">{r.gap}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Restart Button */}
            <div className="w-full flex flex-col gap-2">
              <button
                onClick={handleRestartRace}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black italic text-base uppercase tracking-wider shadow-lg active:scale-98 transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RACE AGAIN</span>
              </button>

              <button
                onClick={handleReturnToMenu}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold text-xs active:scale-98 transition"
              >
                CHANGE CAR / MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
