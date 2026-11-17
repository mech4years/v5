import {
  EnemyType,
  GameSettings,
  MonsterAttackKind,
  MonsterVocalCategory,
  MonsterWeightClass,
  SurfaceKind,
  WeaponId,
} from './types';

export class HorrorAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientStarted = false;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private bossMode = false;
  private bossPhase = 1;
  private bossStepIdx = 0;
  private bossPulseTimer: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private masterVol = 0.75;
  private sfxVol = 0.85;
  private musicVol = 0.6;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.masterGain.gain.value = this.masterVol;
      this.sfxGain.gain.value = this.sfxVol;
      this.musicGain.gain.value = this.musicVol;

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(1.5);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.ambientStarted && this.ctx) {
      this.startAmbientDrone();
    }
  }

  public applySettings(settings: GameSettings): void {
    this.masterVol = settings.masterVolume;
    this.sfxVol = settings.sfxVolume;
    this.musicVol = settings.musicVolume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVol, this.ctx.currentTime, 0.05);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVol, this.ctx.currentTime, 0.05);
    }
  }

  private createNoiseBuffer(seconds: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.musicGain) return;
    this.ambientStarted = true;
    const now = this.ctx.currentTime;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.18, now + 3);

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 41.2; // Low E1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 61.7; // B1 dissonant industrial hum

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(this.musicGain);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
  }

  public setBossMusic(active: boolean, phase = 1): void {
    const nextPhase = Math.max(1, Math.min(5, phase));
    if (this.bossMode === active && (!active || this.bossPhase === nextPhase)) return;
    this.bossMode = active;
    this.bossPhase = nextPhase;
    if (this.bossPulseTimer !== null) {
      window.clearInterval(this.bossPulseTimer);
      this.bossPulseTimer = null;
    }
    if (active) {
      const intervalMs = Math.max(145, 225 - (this.bossPhase - 1) * 18);
      this.bossPulseTimer = window.setInterval(() => {
        this.playBossAdaptiveStep();
      }, intervalMs);
    }
  }

  public setBossPhase(phase: number): void {
    if (!this.bossMode) {
      this.bossPhase = Math.max(1, Math.min(5, phase));
      return;
    }
    this.setBossMusic(true, phase);
  }

  // Original dark industrial-horror boss motif (D Phrygian / harmonic minor ostinato scaling with Phase 1..5)
  private playBossAdaptiveStep(): void {
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const step = this.bossStepIdx % 16;
    this.bossStepIdx += 1;

    // 1. Sub-industrial bass ostinato
    const bassPattern = [73.42, 73.42, 77.78, 73.42, 87.31, 73.42, 82.41, 69.3];
    const bassFreq = bassPattern[step % bassPattern.length] * (this.bossPhase >= 5 ? 1.122 : 1.0);
    if (step % 2 === 0 || this.bossPhase >= 3) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, now);
      osc.frequency.exponentialRampToValueAtTime(bassFreq * 0.72, now + 0.16);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260 + this.bossPhase * 70;
      g.gain.setValueAtTime(0.09 + this.bossPhase * 0.014, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.2);
    }

    // 2. Heavy industrial anvil percussion on accents
    if (step % 4 === 0 || (this.bossPhase >= 4 && step % 4 === 2)) {
      const kick = this.ctx.createOscillator();
      const kg = this.ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(112, now);
      kick.frequency.exponentialRampToValueAtTime(28, now + 0.15);
      kg.gain.setValueAtTime(0.16 + this.bossPhase * 0.015, now);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      kick.connect(kg);
      kg.connect(this.musicGain);
      kick.start(now);
      kick.stop(now + 0.17);
    }

    // 3. Phase 2+ tense brassy dissonance & Phase 4-5 Hollow shriek arpeggio
    if (this.bossPhase >= 2 && (step === 0 || step === 3 || step === 6 || step === 10 || (this.bossPhase >= 4 && step % 2 === 1))) {
      const leadNotes = [146.83, 155.56, 220.0, 233.08, 196.0, 155.56, 261.63, 293.66];
      const fLead = leadNotes[(step + this.bossPhase) % leadNotes.length] * (this.bossPhase >= 5 ? 1.5 : 1.0);
      const lead = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      const bp = this.ctx.createBiquadFilter();
      lead.type = this.bossPhase >= 4 ? 'sawtooth' : 'triangle';
      lead.frequency.setValueAtTime(fLead, now);
      bp.type = 'bandpass';
      bp.frequency.value = 880 + this.bossPhase * 180;
      bp.Q.value = 2.0;
      lg.gain.setValueAtTime(0.001, now);
      lg.gain.linearRampToValueAtTime(0.045 + this.bossPhase * 0.01, now + 0.02);
      lg.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      lead.connect(bp);
      bp.connect(lg);
      lg.connect(this.musicGain);
      lead.start(now);
      lead.stop(now + 0.21);
    }
  }

  public playGunshot(weaponId: WeaponId): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (weaponId === 'energy_rifle') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(125, now + 0.17);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.2);

      // Subharmonic arc discharge
      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, now);
      sub.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      sg.gain.setValueAtTime(0.22, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      sub.connect(sg);
      sg.connect(this.sfxGain);
      sub.start(now);
      sub.stop(now + 0.16);
      return;
    }

    // Ballistic punch + sub-bass + noise crack + mechanical bolt clack
    const dur = weaponId === 'sniper_rifle' ? 0.38 : weaponId === 'heavy_mg' ? 0.18 : 0.14;
    const pitchStart = weaponId === 'sniper_rifle' ? 245 : weaponId === 'heavy_mg' ? 160 : 215;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchStart, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + dur * 0.72);
    oscGain.gain.setValueAtTime(0.38, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);

    // Crisp mechanical bolt-clack transient
    const bolt = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    bolt.type = 'square';
    bolt.frequency.setValueAtTime(weaponId === 'sniper_rifle' ? 1450 : 2150, now + 0.012);
    bolt.frequency.exponentialRampToValueAtTime(680, now + 0.042);
    bGain.gain.setValueAtTime(0.09, now + 0.012);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    bolt.connect(bGain);
    bGain.connect(this.sfxGain);
    bolt.start(now + 0.012);
    bolt.stop(now + 0.05);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = weaponId === 'sniper_rifle' ? 1350 : 1950;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(weaponId === 'sniper_rifle' ? 0.48 : 0.32, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      src.start(now);
      src.stop(now + dur + 0.02);
    }
  }

  public playBossStomp(distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.12, Math.min(1, 18 / (distance + 6)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(68, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.32);
    g.gain.setValueAtTime(0.42 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(g);
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      osc.connect(g);
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playReload(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [0, 0.35, 0.88, 0.96].forEach((offset, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx >= 2 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(idx === 3 ? 880 : idx === 2 ? 640 : 420, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx >= 2 ? 320 : 180, now + offset + 0.065);
      g.gain.setValueAtTime(idx >= 2 ? 0.14 : 0.11, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.075);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.085);
    });
  }

  public playFootstep(sprint = false, crouch = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const vol = crouch ? 0.04 : sprint ? 0.14 : 0.08;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.08);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playClick(high = true): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(high ? 1100 : 620, now);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playHitMarker(crit = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(crit ? 1500 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playEnemyRoar(distance = 10, heavy = false, pan = 0, hydraulic = true): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.08, Math.min(1, 15 / (distance + 4)));
    const now = this.ctx.currentTime;

    const routeOut = (node: AudioNode) => {
      if (this.ctx && typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(panner);
        panner.connect(this.sfxGain!);
      } else {
        node.connect(this.sfxGain!);
      }
    };

    // Layer 1: Distorted biological roar
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 88 : 220, now);
    osc.frequency.linearRampToValueAtTime(heavy ? 46 : 95, now + 0.52);
    g.gain.setValueAtTime(0.24 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.56);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = heavy ? 210 : 620;
    osc.connect(f);
    f.connect(g);
    routeOut(g);
    osc.start(now);
    osc.stop(now + 0.58);

    // Layer 2: Metallic hydraulic actuator whine
    if (hydraulic) {
      const servo = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      servo.type = 'triangle';
      servo.frequency.setValueAtTime(heavy ? 310 : 680, now + 0.04);
      servo.frequency.exponentialRampToValueAtTime(heavy ? 185 : 410, now + 0.34);
      sg.gain.setValueAtTime(0.09 * atten, now + 0.04);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      servo.connect(sg);
      routeOut(sg);
      servo.start(now + 0.04);
      servo.stop(now + 0.4);
    }

    // Layer 3: Wet organic mandible clicks
    for (let c = 0; c < 3; c++) {
      const t = now + c * 0.065;
      const clk = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      clk.type = 'square';
      clk.frequency.setValueAtTime(heavy ? 420 : 1250 - c * 180, t);
      clk.frequency.exponentialRampToValueAtTime(160, t + 0.03);
      cg.gain.setValueAtTime(0.07 * atten, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      clk.connect(cg);
      routeOut(cg);
      clk.start(t);
      clk.stop(t + 0.04);
    }
  }

  public playScreamerShriek(distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.1, Math.min(1, 20 / (distance + 5)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(1780, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.72);
    osc2.frequency.setValueAtTime(960, now);
    osc2.frequency.exponentialRampToValueAtTime(2400, now + 0.25);
    osc2.frequency.exponentialRampToValueAtTime(1100, now + 0.72);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24 * atten, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.76);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1450;
    bp.Q.value = 2.4;

    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(g);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.78);
    osc2.stop(now + 0.78);
  }

  public playArmorShatter(distance = 10, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.14, Math.min(1, 18 / (distance + 4)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.26);
    g.gain.setValueAtTime(0.32 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 0.3);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 950;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.28 * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.24);
    }
  }

  public playAmbientCreak(pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110 + Math.random() * 55, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 1.1);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.06, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      osc.connect(g);
      g.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      osc.connect(g);
      g.connect(this.sfxGain);
    }
    osc.start(now);
    osc.stop(now + 1.2);
  }

  public playAlarmBeep(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playAbility(accent: 'overdrive' | 'shadow' | 'fortress' | 'reboot' | 'pulse'): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    if (accent === 'pulse') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.6);
      g.gain.setValueAtTime(0.32, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.66);
    } else {
      osc.type = 'sine';
      const base = accent === 'shadow' ? 320 : accent === 'fortress' ? 160 : 440;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + 0.28);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.34);
    }
  }

  public playRadioStatic(): void {
    this.unlock();
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100;
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 0.36);
  }

  public isUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  public setCutsceneDrone(mode: 'space' | 'ruins' | 'lab' | 'signal' | 'apc' | 'normal'): void {
    if (!this.ctx || !this.droneOsc1 || !this.droneOsc2 || !this.droneGain) return;
    const now = this.ctx.currentTime;
    if (mode === 'space') {
      this.droneOsc1.frequency.setTargetAtTime(34.6, now, 0.8);
      this.droneOsc2.frequency.setTargetAtTime(51.9, now, 0.8);
      this.droneGain.gain.setTargetAtTime(0.22, now, 0.6);
    } else if (mode === 'ruins') {
      this.droneOsc1.frequency.setTargetAtTime(38.9, now, 0.6);
      this.droneOsc2.frequency.setTargetAtTime(58.3, now, 0.6);
      this.droneGain.gain.setTargetAtTime(0.25, now, 0.5);
    } else if (mode === 'lab') {
      this.droneOsc1.frequency.setTargetAtTime(46.2, now, 0.5);
      this.droneOsc2.frequency.setTargetAtTime(49.0, now, 0.5); // tense beating dissonance
      this.droneGain.gain.setTargetAtTime(0.24, now, 0.4);
    } else if (mode === 'signal') {
      this.droneOsc1.frequency.setTargetAtTime(55.0, now, 0.7);
      this.droneOsc2.frequency.setTargetAtTime(82.4, now, 0.7);
      this.droneGain.gain.setTargetAtTime(0.26, now, 0.5);
    } else if (mode === 'apc') {
      this.droneOsc1.frequency.setTargetAtTime(36.7, now, 0.4);
      this.droneOsc2.frequency.setTargetAtTime(55.0, now, 0.4);
      this.droneGain.gain.setTargetAtTime(0.2, now, 0.3);
    } else {
      this.droneOsc1.frequency.setTargetAtTime(41.2, now, 0.8);
      this.droneOsc2.frequency.setTargetAtTime(61.7, now, 0.8);
      this.droneGain.gain.setTargetAtTime(0.18, now, 0.6);
    }
  }

  public playMeteorEntry(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(240, now + 1.3);
    bp.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 1.4);
  }

  public playMeteorImpact(intensity = 1.0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 1.1);
    g.gain.setValueAtTime(0.42 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.3);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(620, now);
      lp.frequency.exponentialRampToValueAtTime(110, now + 1.0);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.28 * intensity, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 1.2);
    }
  }

  public playLabFlicker(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.setValueAtTime(0.01, now + 0.04);
    g.gain.setValueAtTime(0.08, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playSilhouetteStinger(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Heavy sub thud + dissonant metallic horror scrape
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.7);
    sg.gain.setValueAtTime(0.45, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.78);

    [311, 329, 622].forEach((freq) => {
      if (!this.ctx || !this.sfxGain) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, now);
      o.frequency.linearRampToValueAtTime(freq * 0.92, now + 1.4);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 950;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
      o.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      o.start(now);
      o.stop(now + 1.5);
    });
  }

  public playHeliosSignalPulse(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(440, now);
    carrier.frequency.exponentialRampToValueAtTime(660, now + 0.45);
    carrier.frequency.exponentialRampToValueAtTime(293, now + 1.3);
    mod.type = 'sine';
    mod.frequency.value = 14;
    modGain.gain.value = 48;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    carrier.connect(g);
    g.connect(this.sfxGain);
    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 1.4);
    mod.stop(now + 1.4);
  }

  public playRadioSquelch(disconnect = false): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    if (disconnect) {
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.42);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    } else {
      osc.frequency.setValueAtTime(1750, now);
      osc.frequency.setValueAtTime(1250, now + 0.04);
      g.gain.setValueAtTime(0.1, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    }
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (disconnect ? 0.46 : 0.1));

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = disconnect ? 1600 : 2400;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(disconnect ? 0.22 : 0.1, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + (disconnect ? 0.55 : 0.22));
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + (disconnect ? 0.56 : 0.24));
    }
  }

  public playVehicleImpact(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // Colossal hull slam + metal shriek + debris rattle
    const boom = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(24, now + 0.85);
    bg.gain.setValueAtTime(0.55, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    boom.connect(lp);
    lp.connect(bg);
    bg.connect(this.sfxGain);
    boom.start(now);
    boom.stop(now + 1.0);

    const clang = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    clang.type = 'square';
    clang.frequency.setValueAtTime(520, now);
    clang.frequency.exponentialRampToValueAtTime(135, now + 0.55);
    cg.gain.setValueAtTime(0.24, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    clang.connect(cg);
    cg.connect(this.sfxGain);
    clang.start(now);
    clang.stop(now + 0.6);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 780;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.45, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.82);
    }
  }

  public playDoorHydraulicOpen(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const motor = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(58, now);
    motor.frequency.linearRampToValueAtTime(74, now + 1.6);
    motor.frequency.linearRampToValueAtTime(48, now + 2.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    mg.gain.setValueAtTime(0.001, now);
    mg.gain.linearRampToValueAtTime(0.18, now + 0.25);
    mg.gain.exponentialRampToValueAtTime(0.001, now + 2.9);
    motor.connect(lp);
    lp.connect(mg);
    mg.connect(this.sfxGain);
    motor.start(now);
    motor.stop(now + 2.95);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2200;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.14, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      src.connect(hp);
      hp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.95);
    }
  }

  public playPuzzleSolve(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [440, 587, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      g.gain.setValueAtTime(0.18, now + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.24);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.26);
    });
  }

  public playPuzzleError(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(95, now + 0.26);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playSaveChime(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [520, 780].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      g.gain.setValueAtTime(0.16, now + idx * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.32);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.34);
    });
  }

  public playWaterDrain(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(900, now);
      bp.frequency.exponentialRampToValueAtTime(220, now + 1.4);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 1.5);
    }
  }

  public playMachineCrusher(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.2);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.3);
  }

  public playEndingStinger(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [110, 165, 220, 330].forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 0.96, now + 2.5);
      const lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 2.9);
    });
  }

  private routeSpatial(
    node: AudioNode,
    pan: number,
    occludedWalls: number,
    distance: number,
    addReverb = false
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    let tail: AudioNode = node;

    // Acoustic wall occlusion muffling (solid barriers absorb high frequencies)
    if (occludedWalls > 0) {
      const lpf = this.ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = Math.max(320, 2100 - occludedWalls * 520);
      tail.connect(lpf);
      tail = lpf;
    }

    let target: AudioNode = this.sfxGain;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(panner);
      panner.connect(this.sfxGain);
      target = panner;
    } else {
      tail.connect(this.sfxGain);
    }

    // Subtle distance corridor echo/reverb tail for distant horror sounds
    if (addReverb && distance > 8 && distance < 55) {
      const delay = this.ctx.createDelay(0.4);
      delay.delayTime.value = Math.min(0.24, 0.055 + distance * 0.003);
      const revGain = this.ctx.createGain();
      revGain.gain.value = 0.22;
      const revLpf = this.ctx.createBiquadFilter();
      revLpf.type = 'lowpass';
      revLpf.frequency.value = occludedWalls > 0 ? 550 : 1250;
      tail.connect(delay);
      delay.connect(revLpf);
      revLpf.connect(revGain);
      revGain.connect(target === this.sfxGain ? this.sfxGain : target);
    }
  }

  public playSurfaceFootstep(
    surface: SurfaceKind,
    weight: MonsterWeightClass,
    speedRatio = 1.0,
    distance = 4,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 42) return;
    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.7, occludedWalls);
    const distAtten = Math.max(0.04, Math.min(1, 12 / (distance + 4))) * wallAtten;
    const speedGain = 0.55 + Math.min(1.3, speedRatio) * 0.45;
    const weightGain =
      weight === 'boss'
        ? 0.44
        : weight === 'large'
          ? 0.34
          : weight === 'mech'
            ? 0.28
            : weight === 'medium'
              ? 0.18
              : 0.11;
    const vol = weightGain * distAtten * speedGain;
    if (vol < 0.01) return;

    const pitchVar = 0.9 + Math.random() * 0.22;
    const baseFreq =
      weight === 'boss'
        ? 52
        : weight === 'large'
          ? 74
          : weight === 'mech'
            ? 105
            : weight === 'medium'
              ? 135
              : 240;

    // 1. Primary impact body thud
    const thud = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thud.type = surface === 'metal' || surface === 'industrial' ? 'triangle' : 'sine';
    thud.frequency.setValueAtTime(baseFreq * pitchVar, now);
    thud.frequency.exponentialRampToValueAtTime(Math.max(20, baseFreq * 0.32), now + (weight === 'boss' ? 0.28 : 0.11));
    tg.gain.setValueAtTime(vol, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + (weight === 'boss' ? 0.32 : 0.13));
    thud.connect(tg);
    this.routeSpatial(tg, pan, occludedWalls, distance, weight === 'boss');
    thud.start(now);
    thud.stop(now + 0.34);

    // 2. Surface texture layer (noise burst shaped per surface)
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      const ng = this.ctx.createGain();
      let dur = 0.08;
      let nVol = vol * 0.65;

      if (surface === 'metal' || surface === 'industrial') {
        filter.type = 'bandpass';
        filter.frequency.value = (surface === 'metal' ? 1150 : 780) * pitchVar;
        filter.Q.value = 3.2;
        dur = 0.14;
      } else if (surface === 'gravel') {
        filter.type = 'bandpass';
        filter.frequency.value = 2200 * pitchVar;
        filter.Q.value = 1.2;
        dur = 0.12;
        nVol *= 1.15;
      } else if (surface === 'dirt') {
        filter.type = 'lowpass';
        filter.frequency.value = 540 * pitchVar;
        dur = 0.09;
      } else if (surface === 'water') {
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1450 * pitchVar, now);
        filter.frequency.exponentialRampToValueAtTime(420, now + 0.18);
        filter.Q.value = 1.8;
        dur = 0.19;
        nVol *= 1.25;
      } else if (surface === 'glass') {
        filter.type = 'highpass';
        filter.frequency.value = 3100 * pitchVar;
        dur = 0.11;
        nVol *= 1.1;
      } else {
        // concrete
        filter.type = 'bandpass';
        filter.frequency.value = 620 * pitchVar;
        filter.Q.value = 1.0;
        dur = 0.07;
      }

      ng.gain.setValueAtTime(nVol, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(ng);
      this.routeSpatial(ng, pan, occludedWalls, distance, false);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    // 3. Infected Mech / Boss metallic servo + hydraulic hiss + clank
    if (weight === 'mech' || weight === 'boss') {
      const clank = this.ctx.createOscillator();
      const cg = this.ctx.createGain();
      clank.type = 'square';
      clank.frequency.setValueAtTime((weight === 'boss' ? 280 : 480) * pitchVar, now);
      clank.frequency.exponentialRampToValueAtTime(140, now + 0.07);
      cg.gain.setValueAtTime(vol * 0.34, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      clank.connect(cg);
      this.routeSpatial(cg, pan, occludedWalls, distance, false);
      clank.start(now);
      clank.stop(now + 0.09);

      if (this.noiseBuffer) {
        const hiss = this.ctx.createBufferSource();
        hiss.buffer = this.noiseBuffer;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2600;
        const hg = this.ctx.createGain();
        hg.gain.setValueAtTime(vol * 0.22, now + 0.02);
        hg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        hiss.connect(hp);
        hp.connect(hg);
        this.routeSpatial(hg, pan, occludedWalls, distance, false);
        hiss.start(now + 0.02);
        hiss.stop(now + 0.16);
      }
    }
  }

  public playMonsterVocal(
    enemyType: EnemyType,
    category: MonsterVocalCategory,
    distance = 10,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 58) return;

    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.72, occludedWalls);
    const atten = Math.max(0.05, Math.min(1, 18 / (distance + 5))) * wallAtten;
    const jitter = 0.88 + Math.random() * 0.24;

    const isSmall = enemyType === 'crawler' || enemyType === 'hollow_dweller';
    const isScreamer = enemyType === 'screamer' || enemyType === 'watcher';
    const isMech =
      enemyType === 'sentinel' ||
      enemyType === 'scrapper' ||
      enemyType === 'drowned_machine' ||
      enemyType === 'helios_unit';
    const isBoss =
      enemyType === 'titan' ||
      enemyType === 'titanforged' ||
      enemyType === 'forgemaster' ||
      enemyType === 'guardian' ||
      enemyType === 'origin';

    let baseFreq = isBoss ? 66 : isMech ? 155 : isScreamer ? 580 : isSmall ? 340 : 125;
    let endFreq = baseFreq * 0.58;
    let dur = isBoss ? 0.85 : isScreamer ? 0.65 : isSmall ? 0.28 : 0.48;
    let gainScale = category === 'idle' ? 0.1 : category === 'damage' ? 0.22 : 0.28;

    if (category === 'warning') {
      endFreq = baseFreq * (isScreamer ? 1.85 : 1.15);
      dur *= 1.15;
    } else if (category === 'attack') {
      baseFreq *= 1.22;
      endFreq = baseFreq * 0.48;
      dur *= 0.85;
    } else if (category === 'damage') {
      baseFreq *= 1.38;
      endFreq = baseFreq * 0.65;
      dur *= 0.65;
    } else if (category === 'death') {
      baseFreq *= 0.92;
      endFreq = Math.max(24, baseFreq * 0.24);
      dur *= 1.55;
      gainScale = 0.32;
    } else {
      // idle low breath / chitter
      dur *= 0.7;
    }

    baseFreq *= jitter;
    endFreq *= jitter;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = isScreamer ? 'sawtooth' : isMech ? 'square' : 'sawtooth';
    osc2.type = isSmall ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, endFreq), now + dur);

    osc2.frequency.setValueAtTime(baseFreq * (isBoss ? 0.5 : 1.48), now);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(18, endFreq * (isBoss ? 0.5 : 1.35)), now + dur);

    bp.type = 'bandpass';
    bp.frequency.value = isBoss ? 220 : isScreamer ? 1550 : isMech ? 680 : 480;
    bp.Q.value = isScreamer ? 2.8 : 1.5;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(gainScale * atten, now + Math.min(0.09, dur * 0.22));
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(bp);
    osc2.connect(bp);
    bp.connect(g);
    this.routeSpatial(g, pan, occludedWalls, distance, true);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + dur + 0.03);
    osc2.stop(now + dur + 0.03);

    // Organic throat rasp / mech servo layer
    if (isMech || category === 'death') {
      const servo = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      servo.type = 'triangle';
      servo.frequency.setValueAtTime(isMech ? 520 * jitter : 160, now + 0.03);
      servo.frequency.exponentialRampToValueAtTime(isMech ? (category === 'death' ? 45 : 290) : 40, now + dur * 0.9);
      sg.gain.setValueAtTime(0.1 * atten, now + 0.03);
      sg.gain.exponentialRampToValueAtTime(0.001, now + dur);
      servo.connect(sg);
      this.routeSpatial(sg, pan, occludedWalls, distance, false);
      servo.start(now + 0.03);
      servo.stop(now + dur + 0.03);
    }
  }

  public playAttackWindupSound(
    kind: MonsterAttackKind,
    isMech: boolean,
    distance = 6,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.08, Math.min(1, 14 / (distance + 4)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = isMech ? 'square' : 'sawtooth';
    const f0 = kind === 'heavy_slam' ? 95 : kind === 'charge' ? 140 : 280;
    const f1 = kind === 'heavy_slam' ? 180 : kind === 'charge' ? 320 : 520;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + 0.16);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14 * atten, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, false);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playAttackImpactSound(
    kind: MonsterAttackKind,
    distance = 4,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.1, Math.min(1, 14 / (distance + 3)));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = kind === 'heavy_slam' || kind === 'charge' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(kind === 'heavy_slam' ? 110 : 220, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + (kind === 'heavy_slam' ? 0.34 : 0.16));
    g.gain.setValueAtTime((kind === 'heavy_slam' ? 0.42 : 0.26) * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'heavy_slam' ? 0.36 : 0.18));
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, kind === 'heavy_slam');
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playTentacleWhoosh(
    heavy: boolean,
    distance = 6,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 34) return;
    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.75, occludedWalls);
    const atten = Math.max(0.06, Math.min(1, 14 / (distance + 4))) * wallAtten;
    const dur = heavy ? 0.34 : 0.2;

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(heavy ? 240 : 420, now);
      bp.frequency.exponentialRampToValueAtTime(heavy ? 760 : 1280, now + dur * 0.55);
      bp.frequency.exponentialRampToValueAtTime(heavy ? 180 : 310, now + dur);
      bp.Q.value = 1.9;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime((heavy ? 0.34 : 0.22) * atten, now + dur * 0.38);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(bp);
      bp.connect(g);
      this.routeSpatial(g, pan, occludedWalls, distance, heavy);
      src.start(now);
      src.stop(now + dur + 0.03);
    }

    const body = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(heavy ? 92 : 148, now);
    body.frequency.exponentialRampToValueAtTime(heavy ? 42 : 76, now + dur);
    bg.gain.setValueAtTime((heavy ? 0.16 : 0.09) * atten, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    body.connect(bg);
    this.routeSpatial(bg, pan, occludedWalls, distance, false);
    body.start(now);
    body.stop(now + dur + 0.02);
  }

  public playTentacleImpact(
    heavy: boolean,
    onWall: boolean,
    distance = 5,
    pan = 0,
    occludedWalls = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 36) return;
    const now = this.ctx.currentTime;
    const wallAtten = Math.pow(0.75, occludedWalls);
    const atten = Math.max(0.08, Math.min(1, 15 / (distance + 3))) * wallAtten;

    const thud = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thud.type = onWall ? 'triangle' : 'sine';
    thud.frequency.setValueAtTime(heavy ? (onWall ? 135 : 105) : (onWall ? 220 : 175), now);
    thud.frequency.exponentialRampToValueAtTime(heavy ? 28 : 42, now + (heavy ? 0.24 : 0.14));
    tg.gain.setValueAtTime((heavy ? 0.36 : 0.22) * atten, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.26 : 0.16));
    thud.connect(tg);
    this.routeSpatial(tg, pan, occludedWalls, distance, heavy || onWall);
    thud.start(now);
    thud.stop(now + 0.28);

    if (onWall && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = heavy ? 860 : 1320;
      bp.Q.value = 1.6;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime((heavy ? 0.24 : 0.15) * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(bp);
      bp.connect(ng);
      this.routeSpatial(ng, pan, occludedWalls, distance, false);
      src.start(now);
      src.stop(now + 0.14);
    }
  }

  public playJawSnap(heavy: boolean, distance = 5, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    if (distance > 28) return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.06, Math.min(1, 12 / (distance + 3)));

    const snap = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    snap.type = 'square';
    snap.frequency.setValueAtTime(heavy ? 185 : 390, now);
    snap.frequency.exponentialRampToValueAtTime(heavy ? 52 : 110, now + 0.065);
    sg.gain.setValueAtTime((heavy ? 0.22 : 0.15) * atten, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    snap.connect(sg);
    this.routeSpatial(sg, pan, 0, distance, false);
    snap.start(now);
    snap.stop(now + 0.09);
  }

  public playTitanStompImpact(distance = 8, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.14, Math.min(1, 24 / (distance + 5)));

    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(78, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.58);
    sg.gain.setValueAtTime(0.55 * atten, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    sub.connect(sg);
    this.routeSpatial(sg, pan, 0, distance, true);
    sub.start(now);
    sub.stop(now + 0.65);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(950, now);
      lp.frequency.exponentialRampToValueAtTime(160, now + 0.42);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.42 * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      src.connect(lp);
      lp.connect(ng);
      this.routeSpatial(ng, pan, 0, distance, true);
      src.start(now);
      src.stop(now + 0.48);
    }
  }

  public playTitanGravityPulse(isCharge: boolean, distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.12, Math.min(1, 26 / (distance + 5)));

    if (isCharge) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, now);
      osc.frequency.exponentialRampToValueAtTime(410, now + 0.72);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(180, now);
      bp.frequency.exponentialRampToValueAtTime(980, now + 0.72);
      bp.Q.value = 3.2;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.28 * atten, now + 0.55);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.connect(bp);
      bp.connect(g);
      this.routeSpatial(g, pan, 0, distance, true);
      osc.start(now);
      osc.stop(now + 0.78);
    } else {
      const boom = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      boom.type = 'triangle';
      boom.frequency.setValueAtTime(180, now);
      boom.frequency.exponentialRampToValueAtTime(24, now + 0.65);
      bg.gain.setValueAtTime(0.52 * atten, now);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      boom.connect(bg);
      this.routeSpatial(bg, pan, 0, distance, true);
      boom.start(now);
      boom.stop(now + 0.72);
    }
  }

  public playTitanRegenSound(distance = 12, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.12, Math.min(1, 22 / (distance + 5)));
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.linearRampToValueAtTime(175, now + 0.9);
    lfo.frequency.value = 9;
    lfoGain.gain.value = 28;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 440;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24 * atten, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
    osc.connect(lp);
    lp.connect(g);
    this.routeSpatial(g, pan, 0, distance, true);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 1.1);
    lfo.stop(now + 1.1);
  }

  public playTitanMechShutdown(distance = 10, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.16, Math.min(1, 24 / (distance + 4)));
    const turbine = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    turbine.type = 'sawtooth';
    turbine.frequency.setValueAtTime(240, now);
    turbine.frequency.exponentialRampToValueAtTime(22, now + 1.65);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(920, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 1.65);
    tg.gain.setValueAtTime(0.38 * atten, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 1.72);
    turbine.connect(lp);
    lp.connect(tg);
    this.routeSpatial(tg, pan, 0, distance, true);
    turbine.start(now);
    turbine.stop(now + 1.75);
  }

  public playHollowClawScrape(distance = 5, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.1, Math.min(1, 16 / (distance + 3)));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.16);
    g.gain.setValueAtTime(0.2 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, false);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playHollowLeapSound(distance = 6, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.1, Math.min(1, 16 / (distance + 3)));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    g.gain.setValueAtTime(0.24 * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, true);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playHollowFrenzyShriek(distance = 6, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.12, Math.min(1, 18 / (distance + 3)));
    [760, 1140].forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * (idx === 0 ? 1.45 : 0.62), now + 0.28);
      g.gain.setValueAtTime(0.16 * atten, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g);
      this.routeSpatial(g, pan, 0, distance, true);
      osc.start(now);
      osc.stop(now + 0.32);
    });
  }

  public playGrabImpact(heavy = true, distance = 4, pan = 0): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.15, Math.min(1, 16 / (distance + 3)));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 140 : 195, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.28);
    g.gain.setValueAtTime((heavy ? 0.44 : 0.28) * atten, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    this.routeSpatial(g, pan, 0, distance, true);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playDestructionSound(
    kind: 'barricade' | 'crate' | 'glass' | 'weak_door',
    distance = 8,
    pan = 0
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const atten = Math.max(0.12, Math.min(1, 20 / (distance + 4)));
    const now = this.ctx.currentTime;

    if (kind === 'glass' && this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.32 * atten, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      src.connect(hp);
      hp.connect(ng);
      this.routeSpatial(ng, pan, 0, distance, true);
      src.start(now);
      src.stop(now + 0.4);
      return;
    }

    this.playArmorShatter(distance, pan);
  }

  public playAmbientHorrorEvent(
    kind:
      | 'distant_shriek'
      | 'corridor_steps'
      | 'metal_creak'
      | 'elec_buzz'
      | 'machinery_hum'
      | 'heavy_breath'
      | 'wind_gust'
      | 'distant_impact',
    pan = 0,
    distance = 28
  ): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const atten = Math.max(0.06, Math.min(0.45, 14 / (distance + 8)));

    if (kind === 'distant_shriek') {
      this.playMonsterVocal('screamer', 'warning', distance, pan, 1);
      return;
    }
    if (kind === 'corridor_steps') {
      [0, 0.42, 0.86].forEach((off, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(88 - idx * 4, now + off);
        osc.frequency.exponentialRampToValueAtTime(32, now + off + 0.12);
        g.gain.setValueAtTime(0.14 * atten, now + off);
        g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.14);
        osc.connect(g);
        this.routeSpatial(g, pan, 1, distance, true);
        osc.start(now + off);
        osc.stop(now + off + 0.15);
      });
      return;
    }
    if (kind === 'metal_creak') {
      this.playAmbientCreak(pan);
      return;
    }
    if (kind === 'elec_buzz') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      g.gain.setValueAtTime(0.05 * atten, now);
      g.gain.setValueAtTime(0.01, now + 0.08);
      g.gain.setValueAtTime(0.07 * atten, now + 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(g);
      this.routeSpatial(g, pan, 0, distance, false);
      osc.start(now);
      osc.stop(now + 0.38);
      return;
    }
    if (kind === 'distant_impact') {
      this.playBossStomp(distance, pan);
      return;
    }
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = kind === 'heavy_breath' ? 'bandpass' : 'lowpass';
      bp.frequency.value = kind === 'heavy_breath' ? 520 : kind === 'wind_gust' ? 380 : 210;
      const dur = kind === 'wind_gust' ? 1.4 : 0.75;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.12 * atten, now + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(bp);
      bp.connect(g);
      this.routeSpatial(g, pan, 0, distance, false);
      src.start(now);
      src.stop(now + dur + 0.03);
    }
  }

  public playPortalFire(color: 'blue' | 'orange'): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const baseFreq = color === 'blue' ? 540 : 410;
    const endFreq = color === 'blue' ? 1480 : 1060;

    // Primary harmonic quantum sweep
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.24);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(baseFreq * 2.1, now);
    bp.Q.value = 3.2;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.27);

    // Signature Aperture crisp metallic chirp
    const chime = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(color === 'blue' ? 1320 : 980, now + 0.02);
    chime.frequency.exponentialRampToValueAtTime(color === 'blue' ? 880 : 620, now + 0.19);
    cg.gain.setValueAtTime(0.14, now + 0.02);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    chime.connect(cg);
    cg.connect(this.sfxGain);
    chime.start(now + 0.02);
    chime.stop(now + 0.22);
  }

  public playPortalFizzle(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(115, now + 0.22);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, now);
      bp.frequency.exponentialRampToValueAtTime(420, now + 0.2);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.12, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(this.sfxGain);
      src.start(now);
      src.stop(now + 0.23);
    }
  }

  public playPortalTransit(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const freqs = [240, 480, 720];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f * 0.7, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.9, now + 0.11);
      osc.frequency.exponentialRampToValueAtTime(f * 0.9, now + 0.28);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(idx === 0 ? 0.28 : 0.12, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.32);
    });
  }

  public playPortalUpgrade(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + i * 0.085;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playLongFallShockwave(): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.34);
    g.gain.setValueAtTime(0.38, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.38);

    const chime = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(920, now);
    chime.frequency.exponentialRampToValueAtTime(340, now + 0.22);
    cg.gain.setValueAtTime(0.14, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    chime.connect(cg);
    cg.connect(this.sfxGain);
    chime.start(now);
    chime.stop(now + 0.26);
  }

  public dispose(): void {
    if (this.bossPulseTimer !== null) {
      window.clearInterval(this.bossPulseTimer);
    }
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
  }
}
