export type MusicTrackMode = 'menu' | 'battle' | 'match_point' | 'victory' | 'party' | 'none';

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private masterMusicGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;

  private isPlaying: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 0.35;
  private currentMode: MusicTrackMode = 'none';

  private step: number = 0;
  private timerId: number | null = null;
  private tempoBpm: number = 116;
  private stepDurationMs: number = 125;

  // Synthesizer scale notes (frequencies in Hz)
  private readonly SCALES = {
    // D Dorian / Cyberpunk Cyber Scale: D3, F3, G3, A3, C4, D4, E4, F4
    d_minor: [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 523.25],
    // High energy battle pentatonic
    battle_lead: [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 659.25, 698.46, 783.99],
    // Victory fanfare major chords
    victory_lead: [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]
  };

  // Announcer phrases
  private announcerEnabled: boolean = true;

  constructor() {}

  public init(ctx: AudioContext, destinationNode: AudioNode) {
    if (this.ctx) return;
    this.ctx = ctx;

    // Master filter for pause / menu dampening (club muffled effect)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(3800, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(1.5, this.ctx.currentTime);

    this.masterMusicGain = this.ctx.createGain();
    this.masterMusicGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    this.filterNode.connect(this.masterMusicGain);
    this.masterMusicGain.connect(destinationNode);
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterMusicGain && this.ctx && !this.isMuted) {
      this.masterMusicGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterMusicGain && this.ctx) {
      this.masterMusicGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public setAnnouncerEnabled(enabled: boolean) {
    this.announcerEnabled = enabled;
  }

  public setLowPass(muffled: boolean) {
    if (!this.filterNode || !this.ctx) return;
    const targetFreq = muffled ? 650 : 4200;
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
  }

  public playTrack(mode: MusicTrackMode) {
    if (this.currentMode === mode && this.isPlaying) return;
    this.currentMode = mode;

    if (mode === 'none') {
      this.stop();
      return;
    }

    switch (mode) {
      case 'menu':
        this.tempoBpm = 112;
        break;
      case 'battle':
        this.tempoBpm = 132;
        break;
      case 'match_point':
        this.tempoBpm = 146;
        break;
      case 'victory':
        this.tempoBpm = 124;
        break;
      case 'party':
        this.tempoBpm = 120;
        break;
    }

    this.stepDurationMs = (60 / this.tempoBpm / 4) * 1000; // 16th note subdivision
    this.step = 0;

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.tickLoop();
    }
  }

  public stop() {
    this.isPlaying = false;
    this.currentMode = 'none';
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private tickLoop = () => {
    if (!this.isPlaying || !this.ctx || !this.filterNode) return;

    const time = this.ctx.currentTime + 0.02;
    this.renderStep(this.step % 16, time);
    this.step++;

    this.timerId = window.setTimeout(this.tickLoop, this.stepDurationMs);
  };

  private renderStep(substep: number, time: number) {
    if (this.isMuted || !this.ctx || !this.filterNode) return;

    // --- 1. DRUMS (Kick, Snare, Hi-Hat) ---
    // Kick on beats 0, 4, 8, 12 (4-on-the-floor)
    if (substep % 4 === 0) {
      this.synthKick(time);
    }

    // Snare on 4 and 12 (or backbeat)
    if (this.currentMode !== 'menu' && (substep === 4 || substep === 12)) {
      this.synthSnare(time);
    }

    // Hi-hat on every 2nd 16th note or off-beats
    if (substep % 2 === 1 || this.currentMode === 'match_point') {
      this.synthHiHat(time, substep % 4 === 2 ? 0.35 : 0.2);
    }

    // Extra double-kick adrenaline on Match Point
    if (this.currentMode === 'match_point' && (substep === 2 || substep === 10 || substep === 14)) {
      this.synthKick(time, 0.7);
    }

    // --- 2. SYNTH BASSLINE ---
    const scale = this.SCALES.d_minor;
    let bassFreq = scale[0]; // D3

    if (this.currentMode === 'menu') {
      // Chill bass groove: D -> F -> G -> A
      const bassProg = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
      bassFreq = scale[bassProg[substep]];
      if (substep % 2 === 0) {
        this.synthBass(bassFreq, time, 0.12);
      }
    } else if (this.currentMode === 'battle' || this.currentMode === 'match_point') {
      // 16th-note rolling cyber arpeggiated bassline
      const pattern = [0, 0, 3, 0, 1, 0, 4, 1, 2, 0, 3, 2, 0, 5, 4, 3];
      bassFreq = scale[pattern[substep]];
      this.synthBass(bassFreq, time, 0.08);
    } else if (this.currentMode === 'victory') {
      const vScale = this.SCALES.victory_lead;
      if (substep % 4 === 0) {
        this.synthBass(vScale[substep % vScale.length] * 0.5, time, 0.2);
      }
    } else if (this.currentMode === 'party') {
      // Funky bouncing bass
      if (substep % 4 === 0 || substep % 4 === 3) {
        bassFreq = scale[(substep * 2) % 5];
        this.synthBass(bassFreq, time, 0.1);
      }
    }

    // --- 3. NEON LEAD ARPEGGIOS ---
    if (this.currentMode === 'battle' || this.currentMode === 'match_point') {
      const leads = this.SCALES.battle_lead;
      // High-energy 16th note synth lead
      const leadNote = leads[(substep * 3) % leads.length];
      if (substep % 2 === 0) {
        this.synthLead(leadNote, time, 0.07);
      }
    } else if (this.currentMode === 'victory') {
      const vLeads = this.SCALES.victory_lead;
      const leadNote = vLeads[(substep * 2) % vLeads.length];
      this.synthLead(leadNote, time, 0.12);
    } else if (this.currentMode === 'menu' && substep % 4 === 0) {
      // Occasional soft bell arp
      const bellNote = this.SCALES.battle_lead[(substep / 4) % 4];
      this.synthLead(bellNote, time, 0.22, 'sine');
    }
  }

  // --- SYNTH INSTRUMENTS ---
  private synthKick(time: number, gainMul: number = 1.0) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);

    gain.gain.setValueAtTime(0.7 * gainMul, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + 0.14);
  }

  private synthSnare(time: number) {
    if (!this.ctx || !this.filterNode) return;
    // Tone component
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.1);
    oscGain.gain.setValueAtTime(0.35, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(oscGain);
    oscGain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + 0.11);

    // Noise component
    const bufferSize = this.ctx.sampleRate * 0.12;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.filterNode);

    whiteNoise.start(time);
    whiteNoise.stop(time + 0.13);
  }

  private synthHiHat(time: number, vol: number = 0.25) {
    if (!this.ctx || !this.filterNode) return;
    const bufferSize = this.ctx.sampleRate * 0.04;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.filterNode);

    noise.start(time);
    noise.stop(time + 0.04);
  }

  private synthBass(freq: number, time: number, duration: number) {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 0.5, time); // 1 octave down

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(320, time + duration);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private synthLead(freq: number, time: number, duration: number, shape: string = 'sawtooth') {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = (shape === 'sine' || shape === 'square' || shape === 'triangle' ? shape : 'sawtooth') as OscillatorType;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // --- DYNAMIC VOICE ANNOUNCER ---
  public announce(phrase: string, lang: 'ar' | 'en' = 'en') {
    if (!this.announcerEnabled || this.isMuted) return;

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel(); // Stop pending
        const msg = new SpeechSynthesisUtterance(phrase);
        msg.rate = 1.25; // Energetic arcade pace
        msg.pitch = 1.15; // Punchy cyber pitch
        msg.volume = this.volume * 1.5;

        if (lang === 'ar') {
          msg.lang = 'ar-SA';
        } else {
          msg.lang = 'en-US';
        }

        window.speechSynthesis.speak(msg);
      } catch {
        // Fallback or ignore if blocked
      }
    }
  }
}
