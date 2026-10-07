import { socket } from '../multiplayer';
import * as THREE from 'three';
import { audio } from './audio';
import { CarAgent, TireSmokeSystem } from './car';
import {
  ACCELERATION,
  BRAKE_DECEL,
  CAR_LENGTH,
  CAR_WIDTH,
  DRAG,
  getGearInfo,
  INITIAL_RACERS,
  MAX_L,
  MAX_SPEED,
  TOTAL_LAPS,
} from './constants';
import { MotionBlurPass } from './postprocessing';
import {
  buildScenicWorld,
  buildSunsetEnvironment,
  buildTrackMesh,
  getTrackTransform,
  setStartLights,
  trackCurve,
  TRACK_LENGTH,
  worldToRadar,
} from './track';

export interface LapSplitInfo {
  lapNumber: number;
  time: number;
  timeStr: string;
  isFastest: boolean;
}

export interface GameTelemetry {
  speedKmH: number;
  topSpeedKmH: number;
  gear: number;
  rpmRatio: number;
  playerRank: number;
  currentLap: number;
  totalLaps: number;
  raceTime: number;
  lapTime: number;
  bestLapTime: number;
  lapHistory: LapSplitInfo[];
  recentLapNotification: LapSplitInfo | null;
  driftScore: number;
  isDrifting: boolean;
  gameState: 'MENU' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
  difficulty: 'AMATEUR' | 'PRO' | 'CHAMPION';
  cameraMode: 'chase' | 'hood' | 'orbit';
  isPaused: boolean;
  isWinner: boolean;
  winnerName: string;
  isPodium: boolean;
  countdownValue: string;
  leaderboard: { rank: number; name: string; isPlayer: boolean; time: string; gap: string; finished: boolean }[];
  radarData: { player: { x: number; y: number; angle: number }; ais: { x: number; y: number; id: string; name: string }[] };
}

export function damp(a: number, b: number, k: number, dt: number): number {
  return THREE.MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));
}

export class RacingEngine {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private smokeSystem!: TireSmokeSystem;
  private motionBlurPass!: MotionBlurPass;
  private currentScreenCenter = new THREE.Vector2(0.5, 0.55);

  public racers: CarAgent[] = [];
  public player!: CarAgent;
  private playerName: string;
  private multiplayerOpponentEnabled = false;
  private multiplayerSendTimer = 0;

private sendPlayerPosition(dt: number): void {
  if (!socket.connected) return;

  this.multiplayerSendTimer += dt;

  if (this.multiplayerSendTimer >= 0.05) {
    this.multiplayerSendTimer = 0;

    socket.emit('car-move', {
      name: this.player.name,
  s: this.player.s,
  l: this.player.l,
  speed: this.player.speed,
  lapsCompleted: this.player.lapsCompleted,
  totalDistance: this.player.totalDistance,
  finished: this.player.finished,
  finishTime: this.player.finishTime,
});
  }
}

public setOpponentPosition(
  s: number,
  l: number,
  speed?: number,
  name?: string,
  lapsCompleted?: number,
  totalDistance?: number,
  finished?: boolean,
  finishTime?: number
): void {
  const opponent = this.racers[1];
  if (!opponent) return;

  this.multiplayerOpponentEnabled = true;

  opponent.s = s;
  opponent.l = l;

  if (name !== undefined && name.trim()) {
  opponent.name = name.trim();
}

  if (speed !== undefined) opponent.speed = speed;
  if (lapsCompleted !== undefined) opponent.lapsCompleted = lapsCompleted;
  if (totalDistance !== undefined) opponent.totalDistance = totalDistance;
  if (finished !== undefined) opponent.finished = finished;
  if (finished && !this.player.finished) {
  this.gameState = 'FINISHED';
}
  if (finishTime !== undefined) opponent.finishTime = finishTime;
}

  // Game States
  public gameState: 'MENU' | 'COUNTDOWN' | 'RACING' | 'FINISHED' = 'MENU';
  public isPaused = false;
  public countdownValue = '3';
  private countdownTimer = 3;
  private countdownIntervalId: number | null = null;

  public raceClock = 0;
  public currentLapClock = 0;
  public bestLapTime = Infinity;
  public lapHistory: LapSplitInfo[] = [];
  public recentLapNotification: LapSplitInfo | null = null;
  private lapNotificationTimer = 0;

  public driftPoints = 0;
  public topSpeedKmH = 0;
  public cameraMode: 'chase' | 'hood' | 'orbit' = 'chase';
  public difficulty: 'AMATEUR' | 'PRO' | 'CHAMPION' = 'PRO';
  private playerSmoothSteer = 0;

  // Separate input sources and effective keys
  public keyboardKeys = { gas: false, brake: false, left: false, right: false, drift: false };
  public touchKeys = { gas: false, brake: false, left: false, right: false, drift: false };
  public gamepadKeys = { gas: false, brake: false, left: false, right: false, drift: false };
  public keys = { gas: false, brake: false, left: false, right: false, drift: false };

  private isRunning = false;
  private rafId: number | null = null;
  private clock = new THREE.Clock();
  private gamepadAllowed = true;
  private gpSteeringActive = false;
  private lastGpStartPressed = false;
  private collisionCooldowns: Map<string, number> = new Map();
  private onKeyDownBound!: (e: KeyboardEvent) => void;
  private onKeyUpBound!: (e: KeyboardEvent) => void;
  private onResizeBound!: () => void;
  private onTelemetryUpdate?: (t: GameTelemetry) => void;

  public updateEffectiveKeys(): void {
    this.keys.gas = this.keyboardKeys.gas || this.touchKeys.gas || this.gamepadKeys.gas;
    this.keys.brake = this.keyboardKeys.brake || this.touchKeys.brake || this.gamepadKeys.brake;
    this.keys.left = this.keyboardKeys.left || this.touchKeys.left || this.gamepadKeys.left;
    this.keys.right = this.keyboardKeys.right || this.touchKeys.right || this.gamepadKeys.right;
    this.keys.drift = this.keyboardKeys.drift || this.touchKeys.drift || this.gamepadKeys.drift;
  }

  public setTouchKey(key: 'gas' | 'brake' | 'left' | 'right' | 'drift', isDown: boolean): void {
    this.touchKeys[key] = isDown;
    this.updateEffectiveKeys();
  }

  constructor(
  canvas: HTMLCanvasElement,
  onTelemetryUpdate?: (t: GameTelemetry) => void,
  playerName: string = 'Player'
) {
    this.canvas = canvas;
    this.onTelemetryUpdate = onTelemetryUpdate;
    this.playerName = playerName;
    audio.onAutoPause = () => {
      this.pauseRace();
    };
    this.initThree();
    this.initTrackAndWorld();
    this.initRacers();
    this.initInputListeners();
    this.startLoop();
  }

  public setPlayerName(name: string): void {
  const trimmedName = name.trim();

  if (trimmedName) {
    this.player.name = trimmedName;
  }
}

  private initThree(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Keep mobile GPUs responsive while retaining sharper rendering on desktop.
    const mobileViewport = window.matchMedia('(max-width: 900px)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileViewport ? 1.5 : 2));
    this.renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc2e0fc, 0.00035);

    const aspect = Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.3, 1600);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x2e482e, 0.45);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    this.sunLight.position.set(180, 240, -160);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = mobileViewport ? 768 : 1536;
    this.sunLight.shadow.mapSize.height = mobileViewport ? 768 : 1536;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 700;
    const shadowDist = 80;
    this.sunLight.shadow.camera.left = -shadowDist;
    this.sunLight.shadow.camera.right = shadowDist;
    this.sunLight.shadow.camera.top = shadowDist;
    this.sunLight.shadow.camera.bottom = -shadowDist;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.smokeSystem = new TireSmokeSystem(this.scene);
    this.motionBlurPass = new MotionBlurPass(
      this.renderer,
      this.scene,
      this.camera,
      Math.max(1, window.innerWidth),
      Math.max(1, window.innerHeight)
    );
  }

  private initTrackAndWorld(): void {
    buildSunsetEnvironment(this.scene, this.renderer);
    buildTrackMesh(this.scene, this.renderer);
    buildScenicWorld(this.scene);
  }

  private initRacers(): void {
  for (const r of INITIAL_RACERS) {
    const agent = new CarAgent(
      r.id,
      r.isPlayer ? this.playerName : r.name,
      r.color,
      r.isPlayer,
      r.initialS,
      r.initialL,
      this.scene
    );

    this.racers.push(agent);

    if (r.isPlayer) {
      this.player = agent;
    }
  }
}

  public setPlayerColor(hex: number): void {
    if (this.player) {
      this.player.setPaintColor(hex);
    }
  }

  public setDifficulty(diff: 'AMATEUR' | 'PRO' | 'CHAMPION'): void {
    this.difficulty = diff;
  }

  public cycleCamera(): void {
    if (this.cameraMode === 'chase') this.cameraMode = 'hood';
    else if (this.cameraMode === 'hood') this.cameraMode = 'orbit';
    else this.cameraMode = 'chase';
  }

  public togglePause(): void {
    if (this.gameState !== 'RACING') return;
    if (this.isPaused) {
      this.resumeRace();
    } else {
      this.pauseRace();
    }
  }

  public pauseRace(): void {
    if (this.gameState !== 'RACING' || this.isPaused) return;
    this.isPaused = true;
    audio.pause();
  }

  public resumeRace(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.clock.getDelta(); // flush delta so no time jump on unpause
    audio.resume();
  }

  private resetRaceState(): void {
    for (let i = 0; i < this.racers.length; i++) {
      const racer = this.racers[i];
      const initial = INITIAL_RACERS[i];
      if (initial) {
        racer.s = initial.initialS;
        racer.l = initial.initialL;
        racer.lastS = initial.initialS;
        racer.lapsCompleted = -1;
        racer.totalDistance = -1 + initial.initialS;
        racer.speed = 0;
        racer.vL = 0;
        racer.steerAngle = 0;
        racer.targetSteerAngle = 0;
        racer.bodySwayX = 0;
        racer.roll = 0;
        racer.pitch = 0;
        racer.yawDrift = 0;
        racer.finished = false;
        racer.finishTime = 0;
        racer.isBraking = false;
        racer.isGas = false;
        racer.aiTargetL = initial.initialL;
        racer.aiSteerTimer = 0;
        racer.aiTargetSpeed = 46 + Math.random() * 8;
      }
    }

    this.raceClock = 0;
    this.currentLapClock = 0;
    this.lapHistory = [];
    this.bestLapTime = Infinity;
    this.recentLapNotification = null;
    this.lapNotificationTimer = 0;
    this.driftPoints = 0;
    this.topSpeedKmH = 0;
    this.playerSmoothSteer = 0;
    this.gpSteeringActive = false;
    this.keyboardKeys = { gas: false, brake: false, left: false, right: false, drift: false };
    this.touchKeys = { gas: false, brake: false, left: false, right: false, drift: false };
    this.gamepadKeys = { gas: false, brake: false, left: false, right: false, drift: false };
    this.keys = { gas: false, brake: false, left: false, right: false, drift: false };
    this.collisionCooldowns.clear();
    setStartLights(0);
  }

  public returnToMenu(): void {
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    this.countdownValue = '';
    this.resetRaceState();
    this.gameState = 'MENU';
    this.isPaused = false;
    audio.pause();
  }

  private initInputListeners(): void {
    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.gameState === 'RACING' || this.gameState === 'COUNTDOWN') {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.code)) {
          e.preventDefault();
        }
      }
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keyboardKeys.gas = true;
      if (code === 'KeyS' || code === 'ArrowDown') this.keyboardKeys.brake = true;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keyboardKeys.left = true;
      if (code === 'KeyD' || code === 'ArrowRight') this.keyboardKeys.right = true;
      if (code === 'Space') this.keyboardKeys.drift = true;
      if (code === 'KeyC') this.cycleCamera();
      if (code === 'Escape' || code === 'KeyP') this.togglePause();
      this.updateEffectiveKeys();
    };

    this.onKeyUpBound = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyW' || code === 'ArrowUp') this.keyboardKeys.gas = false;
      if (code === 'KeyS' || code === 'ArrowDown') this.keyboardKeys.brake = false;
      if (code === 'KeyA' || code === 'ArrowLeft') this.keyboardKeys.left = false;
      if (code === 'KeyD' || code === 'ArrowRight') this.keyboardKeys.right = false;
      if (code === 'Space') this.keyboardKeys.drift = false;
      this.updateEffectiveKeys();
    };

    this.onResizeBound = () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.motionBlurPass) {
        this.motionBlurPass.setSize(w, h);
      }
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('resize', this.onResizeBound);
  }

  public async startRace(): Promise<void> {
    audio.init();
    await audio.resume();

    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    this.resetRaceState();

    this.gameState = 'COUNTDOWN';
    this.isPaused = false;
    this.countdownTimer = 3;
    this.countdownValue = '3';
    setStartLights(1);
    audio.playBeep(440, 0.15);

    this.countdownIntervalId = window.setInterval(() => {
      this.countdownTimer--;
      if (this.countdownTimer === 2) {
        this.countdownValue = '2';
        setStartLights(2);
        audio.playBeep(440, 0.15);
      } else if (this.countdownTimer === 1) {
        this.countdownValue = '1';
        setStartLights(3);
        audio.playBeep(440, 0.15);
      } else if (this.countdownTimer === 0) {
        this.countdownValue = 'GO!';
        setStartLights(0);
        audio.playBeep(880, 0.35);
        this.gameState = 'RACING';
        this.currentLapClock = 0;
      } else {
        if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
        this.countdownIntervalId = null;
        this.countdownValue = '';
        setStartLights(0);
      }
    }, 1000);
  }

  public restartRace(): void {
    this.startRace();
  }

  private pollGamepad(): void {
    if (!this.gamepadAllowed) return;
    try {
      if (!navigator.getGamepads) return;
      const gamepads = navigator.getGamepads();
      if (!gamepads) return;
      let gp: Gamepad | null = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i]!.connected) {
          gp = gamepads[i];
          break;
        }
      }
      if (!gp) return;

      const axisX = gp.axes[0] || 0;
      this.gamepadKeys.left = axisX < -0.28;
      this.gamepadKeys.right = axisX > 0.28;
      this.gamepadKeys.gas = !!(gp.buttons[7]?.pressed || gp.buttons[0]?.pressed);
      this.gamepadKeys.brake = !!(gp.buttons[6]?.pressed || gp.buttons[1]?.pressed);
      this.gamepadKeys.drift = !!(gp.buttons[2]?.pressed || gp.buttons[4]?.pressed);
      this.updateEffectiveKeys();

      const startPressed = !!gp.buttons[9]?.pressed;
      if (startPressed && !this.lastGpStartPressed) {
        this.togglePause();
      }
      this.lastGpStartPressed = startPressed;
    } catch {
      this.gamepadAllowed = false;
    }
  }

  // --- ADVANCED VEHICLE DYNAMICS, PROGRESSIVE STEERING & WEIGHT TRANSFER ---
  private updatePlayerPhysics(dt: number): void {
    if (this.gameState !== 'RACING' && this.gameState !== 'FINISHED') return;

    // Smooth cool-down cruise when finished
    if (this.gameState === 'FINISHED') {
      this.player.speed = Math.max(16, this.player.speed - 10 * dt);
      const ds = (this.player.speed * dt) / TRACK_LENGTH;
      this.player.s = (this.player.s + ds + 1.0) % 1.0;
      this.player.isBraking = false;
      this.player.isGas = false;
      return;
    }

    // Connect visual state for exhausts & glowing brake discs
    this.player.isBraking = this.keys.brake;
    this.player.isGas = this.keys.gas;

    // 1. Acceleration / Braking
    if (this.keys.gas) {
      this.player.speed = Math.min(MAX_SPEED, this.player.speed + ACCELERATION * dt);
    } else if (this.keys.brake) {
      this.player.speed = Math.max(-12, this.player.speed - BRAKE_DECEL * dt);
    } else {
      if (this.player.speed > 0) {
        this.player.speed = Math.max(0, this.player.speed - DRAG * dt);
      } else if (this.player.speed < 0) {
        this.player.speed = Math.min(0, this.player.speed + DRAG * dt);
      }
    }

    const currentSpeedKmH = Math.max(0, Math.round(this.player.speed * 3.6));
    if (currentSpeedKmH > this.topSpeedKmH) {
      this.topSpeedKmH = currentSpeedKmH;
    }

    this.player.meshData.taillightMat.emissiveIntensity = this.keys.brake ? 5.5 : 1.8;

    // 2. Realistic Speed-Sensitive Steering Dynamics with Instant-Touch Response
    let rawSteer = 0;
    if (this.keys.left) rawSteer -= 1;
    if (this.keys.right) rawSteer += 1;

    // Fast, responsive steering rack rate (24.0 on input, 32.0 on return to center)
    const steerRackSpeed = rawSteer !== 0 ? 24.0 : 32.0;
    this.playerSmoothSteer = damp(this.playerSmoothSteer, rawSteer, steerRackSpeed, dt);

    // Speed-dependent steering lock: high lock at low speeds (hairpins), aerodynamically trimmed lock at top speed
    const absSpeed = Math.abs(this.player.speed);
    const speedRatio = Math.max(0, Math.min(1, absSpeed / MAX_SPEED));
    const dynamicMaxLock = 0.48 * (1.0 - speedRatio * 0.35); // [0.48 rad down to 0.31 rad]
    const targetWheelAngle = this.playerSmoothSteer * dynamicMaxLock;

    this.player.steerAngle = damp(this.player.steerAngle, targetWheelAngle, 25.0, dt);

    // Dynamic Tire Grip Model & Weight Transfer:
    // 1) Trail Braking: braking shifts weight to front tires, providing sharper turn-in grip (+25%)
    // 2) Throttle Acceleration: weight shifts back, slightly softening front steering sharpness
    let weightTransferMultiplier = 1.0;
    if (this.keys.brake && absSpeed > 10) {
      weightTransferMultiplier = 1.25; // Trail-braking turn-in bite
    } else if (this.keys.gas && absSpeed > 20) {
      weightTransferMultiplier = 0.94; // Front lift under acceleration
    }

    const isDrifting = this.keys.drift && absSpeed > 14;

    // 3. Track Curvature & Centrifugal Dynamics:
    // Centrifugal inertia pushes the car towards the outside of corners at high speed.
    // If the player does NOT steer into the corner, the car drifts toward the outer edge.
    // The player MUST actively steer to follow the curves of the circuit!
    const normS = ((this.player.s % 1.0) + 1.0) % 1.0;
    const curTangent = trackCurve.getTangentAt(normS);
    const aheadNormS = ((normS + 0.005) % 1.0 + 1.0) % 1.0;
    const aheadTangent = trackCurve.getTangentAt(aheadNormS);

    // 2D cross product in X-Z: cross > 0 means track bends right; cross < 0 means track bends left
    const crossVal = curTangent.x * aheadTangent.z - curTangent.z * aheadTangent.x;
    const curveRadius = 0.005 * TRACK_LENGTH;
    const trackCurvature = crossVal / curveRadius;

    // Outward centrifugal acceleration: a = v^2 * curvature
    const diffCentrifugalScale = this.difficulty === 'AMATEUR' ? 0.35 : this.difficulty === 'PRO' ? 0.75 : 1.15;
    const centrifugalAccel = -trackCurvature * (absSpeed * absSpeed) * 0.42 * diffCentrifugalScale;

    // Direct, immediate steering response at all speeds:
    const gripFactor = THREE.MathUtils.clamp(absSpeed / 3.5, 0.25, 1.0);
    const maxLateralSpeed = isDrifting ? 19.0 : 16.5; // Agile, responsive lane control
    const playerSteerVel = this.playerSmoothSteer * maxLateralSpeed * gripFactor * weightTransferMultiplier;

    const targetVL = playerSteerVel + centrifugalAccel;
    const lateralInertia = isDrifting ? 7.5 : 18.0;
    this.player.vL = damp(this.player.vL, targetVL, lateralInertia, dt);

    this.player.l += this.player.vL * dt;

    // Boundary Kerb & Barrier Collision Damping
    if (this.player.l > MAX_L) {
      this.player.l = MAX_L;
      this.player.vL = -Math.abs(this.player.vL) * 0.4;
      this.player.speed *= Math.exp(-2.5 * dt);
    } else if (this.player.l < -MAX_L) {
      this.player.l = -MAX_L;
      this.player.vL = Math.abs(this.player.vL) * 0.4;
      this.player.speed *= Math.exp(-2.5 * dt);
    }

    const ds = (this.player.speed * dt) / TRACK_LENGTH;
    this.player.s = (this.player.s + ds + 1.0) % 1.0;

    // Lap Detection & Timing
    if (this.player.lastS > 0.85 && this.player.s < 0.15) {
      this.player.lapsCompleted++;
      if (this.player.lapsCompleted === 0) {
        // First crossing just behind the starting line: only increment and reset currentLapClock; do NOT record a lap split, chime, or update bestLapTime
        this.currentLapClock = 0;
      } else {
        const finishedLapNum = this.player.lapsCompleted;
        const completedTime = this.currentLapClock;
        const isFastest = completedTime < this.bestLapTime;
        if (isFastest) this.bestLapTime = completedTime;

        const formatT = (sec: number) => {
          const m = Math.floor(sec / 60);
          const s = Math.floor(sec % 60);
          const ms = Math.floor((sec % 1) * 100);
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        };

        const lapInfo: LapSplitInfo = {
          lapNumber: finishedLapNum,
          time: completedTime,
          timeStr: formatT(completedTime),
          isFastest,
        };

        this.lapHistory.push(lapInfo);
        this.recentLapNotification = lapInfo;
        this.lapNotificationTimer = 3.5;

        if (this.player.lapsCompleted >= TOTAL_LAPS) {
          // VICTORY FINISH!
          this.gameState = 'FINISHED';
          this.player.finished = true;
          this.player.finishTime = this.raceClock;

          // Finalize finish times for any AI racers still on track
          for (const r of this.racers) {
  if (this.multiplayerOpponentEnabled && r === this.racers[1]) {
    continue;
  }

  if (!r.finished) {
    r.finished = true;
    const remainingDist =
      Math.max(0, TOTAL_LAPS - r.totalDistance) * TRACK_LENGTH;
    r.finishTime =
      this.raceClock +
      Math.max(0.6, remainingDist / Math.max(25, r.speed || 40));
  }
}
          audio.playVictoryFanfare();
        } 
        else {
          audio.playLapChime();
          this.currentLapClock = 0; // Reset for next lap
        }
      }
    } else if (this.player.lastS < 0.15 && this.player.s > 0.85) {
      this.player.lapsCompleted = Math.max(-1, this.player.lapsCompleted - 1);
    }
    this.player.lastS = this.player.s;
    this.player.totalDistance = this.player.lapsCompleted + this.player.s;

    // 3. Dynamic Weight Transfer, Lateral Body Sway & Roll:
    // When user clicks/steers RIGHT, car body shifts LEFT and rolls LEFT (centrifugal load onto outer suspension).
    // When user clicks/steers LEFT, car body shifts RIGHT and rolls RIGHT!
    const swaySpeedScale = THREE.MathUtils.clamp(absSpeed / 15.0, 0.35, 1.0);

    // Steering right (>0) -> negative swayX (shifts LEFT); steering left (<0) -> positive swayX (shifts RIGHT)
    const targetSwayX = -this.playerSmoothSteer * 0.08 * swaySpeedScale;
    this.player.bodySwayX = damp(this.player.bodySwayX, targetSwayX, 18.0, dt);

    // Body Roll angle (tilting outward in turns):
    // Steering right (>0) -> positive roll (rolls LEFT); steering left (<0) -> negative roll (rolls RIGHT)
    const targetRoll = this.playerSmoothSteer * 0.12 * swaySpeedScale;
    this.player.roll = damp(this.player.roll, targetRoll, 18.0, dt);

    let targetPitch = 0;
    if (this.keys.brake) {
      targetPitch = -0.075; // Dive forward under braking
    } else if (this.keys.gas && this.player.speed < MAX_SPEED * 0.95) {
      targetPitch = 0.05; // Squat rearward under hard acceleration
    }
    this.player.pitch = damp(this.player.pitch, targetPitch, 10.0, dt);

    // In a drift, yaw angle combines steering direction and counter-steer slip angle (flipped sign so steering right yaws right)
    const targetYaw = isDrifting
      ? -(this.player.steerAngle * 1.35 + (this.player.vL / 20.0) * 0.15)
      : -((this.player.vL / 30.0) * 0.1);
    this.player.yawDrift = damp(this.player.yawDrift, targetYaw, 14.0, dt);

    if (isDrifting && Math.abs(this.playerSmoothSteer) > 0.15) {
      this.driftPoints += Math.floor(absSpeed * dt * 50);
    }

    audio.updateEngine(speedRatio, isDrifting, this.keys.gas, Math.abs(this.playerSmoothSteer));
  }

  private updateAI(dt: number): void {
    if (this.gameState !== 'RACING' && this.gameState !== 'FINISHED') return;

    // Dynamic Race Progression: Competitiveness scales smoothly from Lap 1 to Lap 5
    // Lap 1: Warm-up pace (40-44 m/s) -> Lap 5: Grand Prix Championship sprint (58-62 m/s)
    const currentLap = Math.min(TOTAL_LAPS, (this.player?.lapsCompleted || 0) + 1);
    const lapProgressFactor = (currentLap - 1) / (TOTAL_LAPS - 1); // 0.0 on Lap 1 -> 1.0 on Lap 5

    // Base difficulty speed target increases with lap progression and game difficulty
    const diffOffset = this.difficulty === 'AMATEUR' ? -6.5 : this.difficulty === 'PRO' ? 0.0 : 5.0;
    const minSpeedProgression = THREE.MathUtils.lerp(42.0 + diffOffset, 56.0 + diffOffset, lapProgressFactor);
    const maxSpeedProgression = THREE.MathUtils.lerp(45.0 + diffOffset, 61.0 + diffOffset, lapProgressFactor);

    for (let i = 1; i < this.racers.length; i++) {
      const ai = this.racers[i];
      if (i === 1 && this.multiplayerOpponentEnabled) continue;

      if (ai.finished) {
        ai.speed = Math.max(16, ai.speed - 10 * dt);
        const ds = (ai.speed * dt) / TRACK_LENGTH;
        ai.s = (ai.s + ds + 1.0) % 1.0;
        continue;
      }

      // Individual racer skill offset (Apex Blaze & Cyber Viper are faster rivals)
      const rivalBonus = i === 1 ? 2.5 : i === 2 ? 1.5 : i === 3 ? 0.0 : -1.5;
      const baseTarget = THREE.MathUtils.lerp(minSpeedProgression, maxSpeedProgression, (i % 3) / 2.0) + rivalBonus;

      // Dynamic competitive rubber-banding to keep racing intensely close
      const distToPlayer = ai.totalDistance - this.player.totalDistance; // Positive if AI is ahead
      let adjustedTargetSpeed = baseTarget;

      if (distToPlayer < -0.04) {
        // AI is behind player: give slipstream & DRS catch-up aggression (moderated so AI never exceeds cap)
        const catchupBonus = THREE.MathUtils.lerp(1.04, 1.10, lapProgressFactor);
        adjustedTargetSpeed *= catchupBonus;
      } else if (distToPlayer > 0.06) {
        // AI is far ahead: ease off slightly so player can stay in the fight
        adjustedTargetSpeed *= THREE.MathUtils.lerp(0.92, 0.97, lapProgressFactor);
      }

      // Slow AI in corners using the same track-curvature lookahead the player's physics uses
      const aiNormS = ((ai.s % 1.0) + 1.0) % 1.0;
      const aiCurTan = trackCurve.getTangentAt(aiNormS);
      const aiAheadS = ((aiNormS + 0.008) % 1.0 + 1.0) % 1.0;
      const aiAheadTan = trackCurve.getTangentAt(aiAheadS);
      const aiCross = Math.abs(aiCurTan.x * aiAheadTan.z - aiCurTan.z * aiAheadTan.x);
      const aiCurveRad = 0.008 * TRACK_LENGTH;
      const aiCurvature = aiCross / aiCurveRad;
      const aiCornerSlow = Math.max(0.68, 1.0 - aiCurvature * 22.0);
      adjustedTargetSpeed *= aiCornerSlow;

      // Clamp every AI target speed to <= MAX_SPEED * 0.98
      adjustedTargetSpeed = Math.min(MAX_SPEED * 0.98, adjustedTargetSpeed);

      // Hard acceleration / braking
      const accelPower = THREE.MathUtils.lerp(18.0, 28.0, lapProgressFactor);
      if (ai.speed < adjustedTargetSpeed) {
        ai.speed = Math.min(adjustedTargetSpeed, ai.speed + accelPower * dt);
        ai.isGas = true;
        ai.isBraking = false;
      } else {
        ai.speed = Math.max(adjustedTargetSpeed, ai.speed - 26 * dt);
        ai.isGas = false;
        ai.isBraking = true;
      }

      // Smart 4-Lane Racing Line & Overtaking AI
      ai.aiSteerTimer -= dt;
      if (ai.aiSteerTimer <= 0) {
        // Quicker reaction time in later laps
        ai.aiSteerTimer = THREE.MathUtils.lerp(0.45, 0.22, lapProgressFactor) + Math.random() * 0.2;

        // Choose one of the 4 standard lanes: -9.75, -3.25, 3.25, 9.75
        const LANE_CENTERS = [-9.75, -3.25, 3.25, 9.75];
        let chosenLane = LANE_CENTERS[i % 4];

        // Check for traffic ahead in the same lane and execute clean overtaking moves
        for (let j = 0; j < this.racers.length; j++) {
          if (i === j) continue;
          const other = this.racers[j];
          const ds = ((other.s - ai.s + 1.5) % 1.0) - 0.5;
          const distMeters = ds * TRACK_LENGTH;

          // If another car is within 28m ahead in the same lane, switch to an adjacent open lane
          if (distMeters > 0 && distMeters < 32 && Math.abs(other.l - ai.l) < 3.8) {
            const laneIndex = LANE_CENTERS.reduce((closest, lane, idx) =>
              Math.abs(lane - ai.l) < Math.abs(LANE_CENTERS[closest] - ai.l) ? idx : closest, 0
            );
            // Switch to left or right lane depending on track edge
            if (laneIndex > 0 && Math.abs(LANE_CENTERS[laneIndex - 1] - other.l) > 3.0) {
              chosenLane = LANE_CENTERS[laneIndex - 1];
            } else if (laneIndex < 3 && Math.abs(LANE_CENTERS[laneIndex + 1] - other.l) > 3.0) {
              chosenLane = LANE_CENTERS[laneIndex + 1];
            } else {
              chosenLane = other.l > 0 ? other.l - 4.5 : other.l + 4.5;
            }
            break;
          }
        }
        ai.aiTargetL = THREE.MathUtils.clamp(chosenLane, -MAX_L, MAX_L);
      }

      // Smooth, responsive AI steering towards target lane
      const dL = ai.aiTargetL - ai.l;
      const steerAgility = THREE.MathUtils.lerp(8.0, 16.0, lapProgressFactor);
      ai.vL = damp(ai.vL, Math.sign(dL) * Math.min(15, Math.abs(dL) * 4.5), steerAgility, dt);
      ai.steerAngle = (ai.vL / 15) * 0.35;
      ai.l += ai.vL * dt;
      ai.l = THREE.MathUtils.clamp(ai.l, -MAX_L, MAX_L);

      const ds = (ai.speed * dt) / TRACK_LENGTH;
      ai.s = (ai.s + ds + 1.0) % 1.0;

      if (ai.lastS > 0.85 && ai.s < 0.15) {
        ai.lapsCompleted++;
        if (ai.lapsCompleted >= TOTAL_LAPS && !ai.finished) {
          ai.finished = true;
          ai.finishTime = this.raceClock;
        }
      }
      ai.lastS = ai.s;
      ai.totalDistance = ai.lapsCompleted + ai.s;

      // Realistic subtle suspension roll and pitch (tires stay firmly inside wheel wells)
      const aiSpeedRatio = Math.min(1.0, Math.abs(ai.speed) / MAX_SPEED);
      const aiSteerNorm = THREE.MathUtils.clamp(ai.vL / 15, -1.0, 1.0);
      ai.bodySwayX = damp(ai.bodySwayX, -aiSteerNorm * 0.06, 14.0, dt);
      ai.roll = damp(ai.roll, aiSteerNorm * 0.10 * (0.5 + 0.5 * aiSpeedRatio), 14.0, dt);
      ai.pitch = damp(ai.pitch, ai.isBraking ? -0.05 : 0.03, 8.0, dt);
      ai.yawDrift = damp(ai.yawDrift, -aiSteerNorm * 0.07, 10.0, dt);
    }
  }

  private resolveCollisions(): void {
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const c1 = this.racers[i];
        const c2 = this.racers[j];

        // Exclude finished cars from resolveCollisions and let them drive on without blocking
        if (c1.finished || c2.finished) continue;

        const ds = ((c1.s - c2.s + 1.5) % 1.0) - 0.5;
        const distS = Math.abs(ds * TRACK_LENGTH);
        const distL = Math.abs(c1.l - c2.l);

        if (distS < CAR_LENGTH && distL < CAR_WIDTH) {
          const overlapL = CAR_WIDTH - distL;
          const sign = c1.l > c2.l ? 1 : -1;

          c1.l += sign * overlapL * 0.5;
          c2.l -= sign * overlapL * 0.5;

          c1.l = Math.max(-MAX_L, Math.min(MAX_L, c1.l));
          c2.l = Math.max(-MAX_L, Math.min(MAX_L, c2.l));

          const now = performance.now() * 0.001;
          const pairKey = i < j ? `${c1.id}:${c2.id}` : `${c2.id}:${c1.id}`;
          const lastImpact = this.collisionCooldowns.get(pairKey) || 0;
          if (now - lastImpact > 0.3) {
            this.collisionCooldowns.set(pairKey, now);
            const impulseL = 10;
            c1.vL += sign * impulseL;
            c2.vL -= sign * impulseL;

            if (c1.isPlayer || c2.isPlayer) {
              audio.playImpact();
              try {
                if (navigator.vibrate) navigator.vibrate(30);
              } catch {}
            }
          }

          const avgSpeed = (c1.speed + c2.speed) * 0.5;
          c1.speed = avgSpeed;
          c2.speed = avgSpeed;
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.gameState === 'MENU') {
      const time = performance.now() * 0.0006;
      const { worldPos } = getTrackTransform(this.player.s, this.player.l);
      this.camera.position.set(
        worldPos.x + Math.sin(time) * 14,
        worldPos.y + 4.5 + Math.cos(time * 0.5) * 1.5,
        worldPos.z + Math.cos(time) * 14
      );
      this.camera.lookAt(worldPos.x, worldPos.y + 1.2, worldPos.z);
      this.currentScreenCenter.set(0.5, 0.55);
      return;
    }

    const { worldPos, tangent, trueUp } = getTrackTransform(this.player.s, this.player.l);
    const forwardDir = tangent.clone().normalize();
    const upDir = trueUp.clone().normalize();

    const speedKmH = Math.max(0, this.player.speed * 3.6);
    const targetFOV = 62 + (speedKmH / 220) * 15;
    this.camera.fov = damp(this.camera.fov, targetFOV, 5.0, dt);
    this.camera.updateProjectionMatrix();

    let lookTarget: THREE.Vector3;

    if (this.cameraMode === 'hood') {
      // Driver Bonnet / Cockpit camera view
      const camOffset = worldPos.clone().addScaledVector(forwardDir, 0.45).addScaledVector(upDir, 1.22);
      this.camera.position.lerp(camOffset, 1 - Math.exp(-25.0 * dt));
      lookTarget = worldPos.clone().addScaledVector(forwardDir, 28).addScaledVector(upDir, 1.0);
      this.camera.lookAt(lookTarget);
    } else if (this.cameraMode === 'orbit') {
      // Free cinematic orbit camera
      const time = performance.now() * 0.001;
      const orbOffset = new THREE.Vector3(
        Math.sin(time) * 11,
        4.0,
        Math.cos(time) * 11
      );
      this.camera.position.lerp(worldPos.clone().add(orbOffset), 1 - Math.exp(-10.0 * dt));
      lookTarget = worldPos.clone().addScaledVector(upDir, 1.0);
      this.camera.lookAt(lookTarget);
    } else {
      // 3rd-person Chase Camera aligned strictly along the track spline:
      // Sample track spline slightly behind the car (8.8 meters back) so camera
      // perfectly follows road elevation and banking without clipping through ground or barriers!
      const followMeters = 8.8;
      const camTrackS = ((this.player.s - followMeters / TRACK_LENGTH) % 1.0 + 1.0) % 1.0;
      const camTrack = getTrackTransform(camTrackS, this.player.l * 0.4);

      // Elevated 3.8m above the asphalt surface
      const desiredCamPos = camTrack.worldPos.clone().addScaledVector(camTrack.trueUp, 3.8);

      // Safety elevation clamp: ensure camera is always safely above ground and car
      desiredCamPos.y = Math.max(desiredCamPos.y, worldPos.y + 2.0);

      this.camera.position.lerp(desiredCamPos, 1 - Math.exp(-14.0 * dt));

      // Aim camera towards a look-ahead target along the track curve
      const lookAheadMeters = 20.0;
      const lookTrackS = (this.player.s + lookAheadMeters / TRACK_LENGTH) % 1.0;
      const lookTrack = getTrackTransform(lookTrackS, this.player.l * 0.7);
      lookTarget = lookTrack.worldPos.clone().addScaledVector(lookTrack.trueUp, 1.2);

      this.camera.lookAt(lookTarget);
    }

    // Project look-ahead point to screen UV for velocity motion blur vanishing center
    try {
      const proj = lookTarget.clone().project(this.camera);
      this.currentScreenCenter.set(
        THREE.MathUtils.clamp(proj.x * 0.5 + 0.5, 0.2, 0.8),
        THREE.MathUtils.clamp(-proj.y * 0.5 + 0.5, 0.25, 0.85)
      );
    } catch {
      this.currentScreenCenter.set(0.5, 0.55);
    }

    this.sunLight.position.set(worldPos.x + 140, worldPos.y + 160, worldPos.z - 140);
    this.sunLight.target.position.copy(worldPos);
  }

  private startLoop(): void {
    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;
      this.rafId = requestAnimationFrame(animate);

      try {
        const dt = Math.min(this.clock.getDelta(), 0.05);

        // Poll gamepad even while paused so Start can unpause
        this.pollGamepad();

        if (!this.isPaused) {
          if (this.gameState === 'RACING') {
            this.raceClock += dt;
            this.currentLapClock += dt;
          }

          if (this.lapNotificationTimer > 0) {
            this.lapNotificationTimer -= dt;
            if (this.lapNotificationTimer <= 0) {
              this.recentLapNotification = null;
            }
          }

          this.updatePlayerPhysics(dt);
          this.sendPlayerPosition(dt);
          this.updateAI(dt);
          this.resolveCollisions();
          this.smokeSystem.update(dt);

          for (let i = 0; i < this.racers.length; i++) {
            this.racers[i].updateVisuals(dt, this.smokeSystem);
          }

          this.updateCamera(dt);
        }

        const speedKmH = Math.max(0, this.player.speed * 3.6);
        this.motionBlurPass.render(
          speedKmH,
          this.keys.gas,
          this.currentScreenCenter,
          dt,
          performance.now() * 0.001
        );
        this.emitTelemetry();
      } catch (e) {
        console.error('Render loop error:', e);
      }
    };
    this.rafId = requestAnimationFrame(animate);
  }

  private emitTelemetry(): void {
    if (!this.onTelemetryUpdate) return;

    // True Grand Prix finish classification
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) {
        return a.finishTime - b.finishTime;
      }
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalDistance - a.totalDistance;
    });
    const playerRank = sorted.findIndex((r) => r.isPlayer) + 1;

    const speedKmH = Math.max(0, Math.round(this.player.speed * 3.6));
    const speedRatio = Math.max(0, Math.min(1, this.player.speed / MAX_SPEED));
    const { gear: currentGear, rpm: rpmRatio } = getGearInfo(speedRatio);

    const formatT = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 100);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    };

    const winnerTime = sorted[0].finished ? sorted[0].finishTime : this.raceClock;
    const leaderboard = sorted.map((r, idx) => {
      let timeStr = '';
      let gapStr = '';
      if (r.finished) {
        timeStr = formatT(r.finishTime);
        const gapSec = r.finishTime - winnerTime;
        gapStr = idx === 0 ? 'WINNER' : `+${Math.max(0.01, gapSec).toFixed(2)}s`;
      } else {
        const distGap = Math.max(0, sorted[0].totalDistance - r.totalDistance);
        const timeGapSec = (distGap * TRACK_LENGTH) / Math.max(20, r.speed || 40);
        timeStr = formatT(this.raceClock + timeGapSec);
        gapStr = idx === 0 ? 'LEADER' : `+${timeGapSec.toFixed(2)}s`;
      }
      return {
        rank: idx + 1,
        name: r.name,
        isPlayer: r.isPlayer,
        time: timeStr,
        gap: gapStr,
        finished: r.finished,
      };
    });

    const pT = getTrackTransform(this.player.s);
    const pRadar = worldToRadar(pT.worldPos.x, pT.worldPos.z);
    const pAngle = Math.atan2(pT.tangent.x, pT.tangent.z);

    const radarData = {
      player: { x: pRadar.x, y: pRadar.y, angle: pAngle },
      ais: this.racers
        .filter((r) => !r.isPlayer)
        .map((ai) => {
          const aiT = getTrackTransform(ai.s);
          const aiRadar = worldToRadar(aiT.worldPos.x, aiT.worldPos.z);
          return { x: aiRadar.x, y: aiRadar.y, id: ai.id, name: ai.name };
        }),
    };

    this.onTelemetryUpdate({
      speedKmH,
      topSpeedKmH: this.topSpeedKmH,
      gear: currentGear,
      rpmRatio,
      playerRank,
      currentLap: Math.min(TOTAL_LAPS, Math.max(1, this.player.lapsCompleted + 1)),
      totalLaps: TOTAL_LAPS,
      raceTime: this.raceClock,
      lapTime: this.currentLapClock,
      bestLapTime: this.bestLapTime === Infinity ? 0 : this.bestLapTime,
      lapHistory: this.lapHistory,
      recentLapNotification: this.recentLapNotification,
      driftScore: this.driftPoints,
      isDrifting: this.keys.drift && Math.abs(this.player.speed) > 14,
      gameState: this.gameState,
      difficulty: this.difficulty,
      cameraMode: this.cameraMode,
      isPaused: this.isPaused,
      isWinner: playerRank === 1 && this.gameState === 'FINISHED',
      winnerName: sorted[0].name,
      isPodium: playerRank <= 3 && this.gameState === 'FINISHED',
      countdownValue: this.countdownValue,
      leaderboard,
      radarData,
    });
  }

  public dispose(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.onKeyDownBound) window.removeEventListener('keydown', this.onKeyDownBound);
    if (this.onKeyUpBound) window.removeEventListener('keyup', this.onKeyUpBound);
    if (this.onResizeBound) window.removeEventListener('resize', this.onResizeBound);
    if (this.countdownIntervalId) clearInterval(this.countdownIntervalId);
    if (this.motionBlurPass) this.motionBlurPass.dispose();
    this.renderer.dispose();
  }
}
