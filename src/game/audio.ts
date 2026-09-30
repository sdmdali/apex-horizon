import { getGearInfo } from './constants';

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidSource: AudioBufferSourceNode | null = null;
  private isInitialized = false;
  private lastImpactTime = 0;
  private muted = false;
  private isPaused = false;
  public onAutoPause?: () => void;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pause();
          if (this.onAutoPause) this.onAutoPause();
        }
      });
    }
  }

  public init(): void {
    if (this.isInitialized) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();

      // 1. Primary engine oscillator (Sawtooth)
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);

      // 2. Sub-rumble oscillator (Triangle)
      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'triangle';
      this.subOsc.frequency.setValueAtTime(27.5, this.ctx.currentTime);

      // 3. Engine low-pass resonant filter
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(450, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      // 4. Master engine gain
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      this.engineOsc.connect(this.filter);
      this.subOsc.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc.start();
      this.subOsc.start();

      // 5. Procedural tire screech white noise
      const bufferLen = Math.max(1, Math.floor(this.ctx.sampleRate * 1.5));
      const noiseBuffer = this.ctx.createBuffer(1, bufferLen, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.skidSource = this.ctx.createBufferSource();
      this.skidSource.buffer = noiseBuffer;
      this.skidSource.loop = true;

      this.skidFilter = this.ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
      this.skidFilter.Q.setValueAtTime(3.8, this.ctx.currentTime);

      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.skidSource.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.ctx.destination);

      this.skidSource.start();
      this.isInitialized = true;
    } catch (e) {
      console.warn('Audio initialization bypassed:', e);
    }
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }
    this.isPaused = false;
    if (this.engineGain && !this.muted && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.03);
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
    if (this.skidGain && this.ctx) {
      this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(muted || this.isPaused ? 0 : 0.08, this.ctx.currentTime, 0.03);
    }
    if (this.skidGain && (muted || this.isPaused) && this.ctx) {
      this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  public updateEngine(speedRatio: number, isDrifting: boolean, isGas: boolean, steerAbs = 0): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running' || this.muted || this.isPaused) return;

    const safeRatio = Math.max(0, Math.min(1, isNaN(speedRatio) ? 0 : speedRatio));
    const { gear: currentGear, rpm: gearRpm } = getGearInfo(safeRatio);
    const rpm = 0.25 + gearRpm * 0.75;

    const baseFreq = Math.max(30, Math.min(650, 48 + rpm * 115 + currentGear * 11));
    const targetCutoff = Math.max(250, Math.min(4800, 420 + (isGas ? 1100 : 180) + rpm * 2200));
    const targetSkidGain = (isDrifting && steerAbs > 0.15) ? Math.min(0.22, safeRatio * 0.25) : 0;

    const now = this.ctx.currentTime;
    try {
      if (this.engineOsc) this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.03);
      if (this.subOsc) this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03);
      if (this.filter) this.filter.frequency.setTargetAtTime(targetCutoff, now, 0.03);
      if (this.skidGain) this.skidGain.gain.setTargetAtTime(targetSkidGain, now, 0.03);
    } catch {
      // Audio param error safeguard
    }
  }

  public playBeep(freq = 440, duration = 0.12): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  public playLapChime(): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.18, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
    } catch {}
  }

  public playVictoryFanfare(): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.22, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.001, now + i * 0.12 + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.4);
      });
    } catch {}
  }

  public playImpact(): void {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const now = performance.now();
    if (now - this.lastImpactTime < 220) return;
    this.lastImpactTime = now;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(28, this.ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch {}
  }
}

export const audio = new SoundSynthesizer();
