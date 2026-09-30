export const TRACK_WIDTH = 26;
export const HALF_WIDTH = TRACK_WIDTH / 2;
export const MAX_L = HALF_WIDTH - 1.5; // Boundary limit at outer barriers
export const TOTAL_LAPS = 5;
export const CAR_LENGTH = 5.2;
export const CAR_WIDTH = 2.4;
export const MAX_SPEED = 60; // ~216 km/h
export const ACCELERATION = 26;
export const BRAKE_DECEL = 45;
export const DRAG = 5.5;

export function getGearInfo(speedRatio: number): { gear: number; rpm: number } {
  const r = Math.max(0, Math.min(1, isNaN(speedRatio) ? 0 : speedRatio));
  const gear = Math.min(6, Math.floor(r * 6) + 1);
  const rpm = Math.max(0, Math.min(1, r * 6 - (gear - 1)));
  return { gear, rpm };
}

export interface RacerInfo {
  id: string;
  name: string;
  color: number;
  colorHex: string;
  isPlayer: boolean;
  initialS: number;
  initialL: number;
}

export const INITIAL_RACERS: RacerInfo[] = [
  { id: 'player', name: 'Player', color: 0x0077ff, colorHex: '#0077ff', isPlayer: true, initialS: 0.995, initialL: -3.25 },
  { id: 'ai1', name: 'Apex Blaze', color: 0xee2233, colorHex: '#ee2233', isPlayer: false, initialS: 0.990, initialL: 3.25 },
  { id: 'ai2', name: 'Cyber Viper', color: 0x00dd66, colorHex: '#00dd66', isPlayer: false, initialS: 0.985, initialL: -9.75 },
  { id: 'ai3', name: 'Shadow Phantom', color: 0x9922ee, colorHex: '#9922ee', isPlayer: false, initialS: 0.980, initialL: 9.75 },
  { id: 'ai4', name: 'Solar Strike', color: 0xffaa00, colorHex: '#ffaa00', isPlayer: false, initialS: 0.975, initialL: 0.0 },
];
