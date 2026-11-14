// All sound is synthesised live with the Web Audio API. No audio files.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.wind = null;
    this.drone = null;
    this.alarmTimer = null;
    this.geigerTimer = null;
    this.geigerRate = 0;
    this.marsFilter = false;
    this.infra = null;
    this.lock = null;
    this.thrust = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    // Dry path (Earth air) and wet path (Mars: thin CO2 low-pass + slight propagation delay).
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.marsLP = ctx.createBiquadFilter();
    this.marsLP.type = 'lowpass';
    this.marsLP.frequency.value = 600;
    this.marsLP.Q.value = 0.6;
    this.marsDelay = ctx.createDelay(1);
    this.marsDelay.delayTime.value = 0.045;
    this.marsFb = ctx.createGain();
    this.marsFb.gain.value = 0.18;
    this.master.connect(this.dry);
    this.master.connect(this.marsLP);
    this.marsLP.connect(this.wet);
    this.marsLP.connect(this.marsDelay);
    this.marsDelay.connect(this.marsFb);
    this.marsFb.connect(this.marsDelay);
    this.marsDelay.connect(this.wet);
    this.dry.connect(comp);
    this.wet.connect(comp);
    comp.connect(ctx.destination);
    this.applyFilter();

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Brown (red) noise for infrasound rumble.
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
  }

  applyFilter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dry.gain.setTargetAtTime(this.marsFilter ? 0 : 1, t, 0.08);
    this.wet.gain.setTargetAtTime(this.marsFilter ? 1.25 : 0, t, 0.08);
  }

  setMarsFilter(on) {
    this.marsFilter = !!on;
    this.applyFilter();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  tone({ freq = 440, to = null, dur = 0.2, type = 'sine', vol = 0.2, delay = 0, attack = 0.005 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, type = 'lowpass', freq = 1000, to = null, q = 0.7, delay = 0, attack = 0.004 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // --- one-shots ---
  click() {
    this.tone({ freq: 1400, dur: 0.04, type: 'square', vol: 0.05 });
  }
  hover() {
    this.tone({ freq: 2100, dur: 0.03, type: 'sine', vol: 0.03 });
  }
  grab() {
    this.noise({ dur: 0.07, vol: 0.25, type: 'bandpass', freq: 2400, q: 2 });
    this.tone({ freq: 520, to: 780, dur: 0.12, type: 'triangle', vol: 0.18 });
    this.tone({ freq: 1040, dur: 0.16, type: 'sine', vol: 0.12, delay: 0.09 });
    this.tone({ freq: 90, to: 50, dur: 0.18, type: 'sine', vol: 0.3, delay: 0.42 });
  }
  drop() {
    this.tone({ freq: 620, to: 310, dur: 0.14, type: 'triangle', vol: 0.16 });
    this.tone({ freq: 110, to: 45, dur: 0.22, type: 'sine', vol: 0.35, delay: 0.4 });
    this.noise({ dur: 0.1, vol: 0.2, type: 'lowpass', freq: 500, delay: 0.4 });
  }
  deny() {
    this.tone({ freq: 140, dur: 0.16, type: 'sawtooth', vol: 0.16 });
    this.tone({ freq: 105, dur: 0.22, type: 'sawtooth', vol: 0.16, delay: 0.17 });
  }
  // The bunker countdown: a low thump with a tick on top, tightening in the last ten seconds.
  pulse(urgent) {
    this.tone({ freq: urgent ? 78 : 62, to: 36, dur: 0.24, type: 'sine', vol: urgent ? 0.6 : 0.42 });
    this.tone({ freq: urgent ? 1320 : 880, dur: 0.05, type: 'square', vol: urgent ? 0.09 : 0.045 });
    if (urgent) this.tone({ freq: 1320, dur: 0.05, type: 'square', vol: 0.07, delay: 0.5 });
  }
  chime() {
    [659, 880, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.12, delay: i * 0.11 }));
  }
  telemetry() {
    [1175, 1568].forEach((f, i) => this.tone({ freq: f, dur: 0.14, type: 'sine', vol: 0.08, delay: i * 0.08 }));
  }
  alert() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.09, delay: i * 0.2 });
      this.tone({ freq: 660, dur: 0.08, type: 'square', vol: 0.09, delay: i * 0.2 + 0.1 });
    }
  }
  success() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.7, type: 'triangle', vol: 0.13, delay: i * 0.13 }),
    );
  }
  failure() {
    this.tone({ freq: 220, to: 55, dur: 2.2, type: 'sawtooth', vol: 0.14 });
    this.tone({ freq: 233, to: 58, dur: 2.2, type: 'sawtooth', vol: 0.1 });
    this.tone({ freq: 1000, dur: 2.4, type: 'sine', vol: 0.05, delay: 0.4 });
  }
  launch() {
    this.noise({ dur: 4.6, vol: 0.7, type: 'lowpass', freq: 90, to: 900, attack: 1.6 });
    this.tone({ freq: 38, to: 70, dur: 4.4, type: 'sawtooth', vol: 0.25, attack: 1.2 });
  }
  laser() {
    this.tone({ freq: 2400, to: 900, dur: 0.18, type: 'sawtooth', vol: 0.05 });
    this.tone({ freq: 4800, to: 1800, dur: 0.12, type: 'sine', vol: 0.05, delay: 0.02 });
    this.noise({ dur: 0.08, vol: 0.12, type: 'highpass', freq: 5000, delay: 0.05 });
  }
  quake() {
    this.noise({ dur: 3.2, vol: 0.55, type: 'lowpass', freq: 60, to: 140, attack: 0.4, q: 4 });
    this.tone({ freq: 24, to: 18, dur: 3, type: 'sine', vol: 0.5, attack: 0.3 });
  }
  clamp() {
    this.noise({ dur: 0.12, vol: 0.4, type: 'bandpass', freq: 900, q: 3 });
    this.tone({ freq: 180, to: 90, dur: 0.3, type: 'square', vol: 0.12, delay: 0.05 });
    this.chime();
  }
  shutter() {
    this.noise({ dur: 0.05, vol: 0.3, type: 'highpass', freq: 3000 });
    this.noise({ dur: 0.06, vol: 0.25, type: 'highpass', freq: 2500, delay: 0.09 });
  }
  // Warm harmonic chord for the Pale Blue Dot.
  harmonic() {
    [261.6, 329.6, 392, 493.9, 587.3].forEach((f, i) =>
      this.tone({ freq: f, dur: 3.4, type: 'triangle', vol: 0.07, delay: i * 0.18, attack: 0.6 }),
    );
    this.tone({ freq: 130.8, dur: 3.8, type: 'sine', vol: 0.09, attack: 0.8 });
  }
  thruster(on) {
    if (!this.ctx) return;
    if (on && !this.thrust) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      this.thrust = { src, g };
    } else if (!on && this.thrust) {
      const { src, g } = this.thrust;
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.06);
      src.stop(this.ctx.currentTime + 0.4);
      this.thrust = null;
    }
  }

  // Signal-lock tone: carrier slides toward the target; beats while misaligned.
  lockStart() {
    if (!this.ctx || this.lock) return;
    const ctx = this.ctx;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sine';
    b.type = 'sine';
    a.frequency.value = 880;
    b.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.06, ctx.currentTime, 0.1);
    a.connect(g);
    b.connect(g);
    g.connect(this.master);
    a.start();
    b.start();
    this.lock = { a, b, g };
  }
  lockUpdate(err) {
    if (!this.lock) return;
    const t = this.ctx.currentTime;
    this.lock.b.frequency.setTargetAtTime(880 + Math.min(1, Math.abs(err)) * 140, t, 0.03);
  }
  lockStop(success) {
    if (!this.lock) return;
    const { a, b, g } = this.lock;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.05);
    a.stop(t + 0.3);
    b.stop(t + 0.3);
    this.lock = null;
    if (success) [880, 1320, 1760].forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'sine', vol: 0.1, delay: i * 0.07 }));
    else this.deny();
  }

  // InSight-inspired wind infrasound: brown noise through a resonant low-pass plus a sub oscillator.
  startInfrasound() {
    if (!this.ctx || this.infra) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 70;
    lp.Q.value = 9;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 22;
    const subG = ctx.createGain();
    subG.gain.value = 0.0001;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(lp);
    lp.connect(g);
    sub.connect(subG);
    subG.connect(g);
    g.connect(this.master);
    src.start();
    sub.start();
    this.infra = { src, lp, sub, subG, g };
  }
  setInfrasound(windMs, sheltered) {
    if (!this.infra) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, windMs / 26) * (sheltered ? 0.2 : 1);
    this.infra.g.gain.setTargetAtTime(0.08 + k * 0.55, t, 0.7);
    this.infra.lp.frequency.setTargetAtTime(45 + k * 90, t, 0.7);
    this.infra.subG.gain.setTargetAtTime(0.05 + k * 0.25, t, 0.7);
    this.infra.sub.frequency.setTargetAtTime(16 + k * 14, t, 0.9);
  }
  stopInfrasound() {
    if (!this.infra) return;
    const { src, sub, g } = this.infra;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.3);
    src.stop(t + 1.5);
    sub.stop(t + 1.5);
    this.infra = null;
  }

  geigerClick() {
    this.noise({ dur: 0.012, vol: 0.32, type: 'highpass', freq: 3200, attack: 0.001 });
  }

  // --- continuous beds ---
  startDrone() {
    if (!this.ctx || this.drone) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const oscs = [55, 55.6, 82.4].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    lp.connect(g);
    g.connect(this.master);
    this.drone = { g, oscs };
  }
  stopDrone() {
    if (!this.drone) return;
    const { g, oscs } = this.drone;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.4);
    oscs.forEach((o) => o.stop(t + 2));
    this.drone = null;
  }

  startWind() {
    if (!this.ctx || this.wind) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.31;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.02;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
    lfo2.start();
    this.wind = { src, bp, g, lfo, lfo2, lfoGain };
    this.setWind(0.15);
  }
  // intensity 0..1: thin Martian breeze up to a full dust storm
  setWind(i) {
    if (!this.wind) return;
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.05 + i * 0.5, t, 0.8);
    this.wind.bp.frequency.setTargetAtTime(320 + i * 520, t, 0.8);
    this.wind.lfoGain.gain.setTargetAtTime(120 + i * 260, t, 0.8);
  }
  stopWind() {
    if (!this.wind) return;
    const { src, g, lfo, lfo2 } = this.wind;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.3);
    src.stop(t + 1.5);
    lfo.stop(t + 1.5);
    lfo2.stop(t + 1.5);
    this.wind = null;
  }

  // clicks per second, Poisson distributed
  setGeiger(rate) {
    this.geigerRate = rate;
    if (rate > 0 && !this.geigerTimer) {
      this.geigerTimer = setInterval(() => {
        if (!this.ctx || this.geigerRate <= 0) return;
        let p = this.geigerRate * 0.08;
        while (p > 0) {
          if (Math.random() < Math.min(1, p)) this.geigerClick();
          p -= 1;
        }
      }, 80);
    } else if (rate <= 0 && this.geigerTimer) {
      clearInterval(this.geigerTimer);
      this.geigerTimer = null;
    }
  }

  startAlarm() {
    if (this.alarmTimer) return;
    let k = 0;
    const fire = () => {
      this.tone({ freq: k % 2 ? 470 : 620, dur: 0.3, type: 'square', vol: 0.07 });
      k++;
    };
    fire();
    this.alarmTimer = setInterval(fire, 340);
  }
  stopAlarm() {
    if (!this.alarmTimer) return;
    clearInterval(this.alarmTimer);
    this.alarmTimer = null;
  }

  stopAll() {
    this.stopAlarm();
    this.setGeiger(0);
    this.stopWind();
    this.stopDrone();
    this.stopInfrasound();
    this.thruster(false);
    if (this.lock) this.lockStop(false);
  }
}

export const audio = new AudioEngine();
