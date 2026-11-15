// SOL 60: RED HORIZON — fully procedural Web Audio: wind, footsteps, jump/land, welding arc,
// Geiger clicks, quake rumble, rover motor, rocket roar, radio blips and a Martian CO2 filter.

import { morseSequence, MORSE_UNIT } from '../logic/morse.js';

class AudioSynth {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.marsFilterOn = true;
    this._loops = {};
    this._geigerT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
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
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    // Mars' thin CO2 atmosphere damps high frequencies: a gentle low-pass + slight level drop.
    this.marsFilter = c.createBiquadFilter();
    this.marsFilter.type = 'lowpass';
    this.marsFilter.Q.value = 0.4;
    this.master.connect(this.marsFilter);
    this.marsFilter.connect(c.destination);
    this._applyFilter();
    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startLoops();
  }

  _applyFilter() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.marsFilter.frequency.setTargetAtTime(this.marsFilterOn ? 2400 : 20000, t, 0.05);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMarsFilter(on) {
    this.marsFilterOn = on;
    this._applyFilter();
  }

  _noiseSrc(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  _startLoops() {
    const c = this.ctx;
    const mk = (type, freq, q) => {
      const src = this._noiseSrc();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    };
    this._loops.wind = mk('lowpass', 420, 0.7);
    this._loops.arc = mk('bandpass', 3200, 1.4);
    this._loops.rumble = mk('lowpass', 90, 1.2);
    this._loops.storm = mk('bandpass', 700, 0.5);
    // rover motor: sawtooth through low-pass
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    const mf = c.createBiquadFilter();
    mf.type = 'lowpass';
    mf.frequency.value = 380;
    const mg = c.createGain();
    mg.gain.value = 0;
    osc.connect(mf).connect(mg).connect(this.master);
    osc.start();
    this._loops.motor = { osc, f: mf, g: mg };
    // rocket roar
    this._loops.rocket = mk('lowpass', 260, 0.8);
  }

  _set(name, gain, tc = 0.12) {
    const l = this._loops[name];
    if (!l || !this.ctx) return;
    l.g.gain.setTargetAtTime(gain, this.ctx.currentTime, tc);
  }

  /** Called every frame with the current ambience state. */
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._set('wind', 0.05 + s.wind * 0.22, 0.3);
    this._loops.wind.f.frequency.setTargetAtTime(300 + s.wind * 700 - s.dust * 180, t, 0.3);
    this._set('storm', s.dust * 0.28, 0.4);
    this._set('arc', s.welding ? 0.09 + Math.random() * 0.07 : 0, 0.03);
    this._set('rumble', Math.max(s.quake * 0.9, s.dust * 0.4), 0.08); // quakes and the infrasound roar of a storm
    this._set('rocket', s.rocket * 0.9, 0.2);
    const m = this._loops.motor;
    m.g.gain.setTargetAtTime(s.motor > 0 ? 0.05 + s.motor * 0.08 : 0, t, 0.1);
    m.osc.frequency.setTargetAtTime(45 + s.motor * 70, t, 0.1);
    // Geiger: Poisson clicks at a rate in clicks/s
    if (s.geiger > 0) {
      this._geigerT -= dt;
      if (this._geigerT <= 0) {
        this.click(0.25);
        this._geigerT = -Math.log(Math.max(1e-4, Math.random())) / s.geiger;
      }
    }
  }

  _env(node, peak, a, d, at) {
    const t = at ?? this.ctx.currentTime;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _burst(type, freq, q, peak, a, d) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = this._noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    s.connect(f).connect(g).connect(this.master);
    this._env(g, peak, a, d);
    s.start(c.currentTime, Math.random() * 1.5);
    s.stop(c.currentTime + a + d + 0.05);
  }

  _tone(type, f0, f1, peak, dur, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + delay;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    o.connect(g).connect(this.master);
    this._env(g, peak, 0.01, dur, t);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(heavy = 0) {
    this._burst('lowpass', 500 + Math.random() * 200, 0.8, 0.12 + heavy * 0.1, 0.005, 0.12);
  }
  jump() {
    this._burst('lowpass', 260, 0.7, 0.18, 0.01, 0.2);
    this._tone('sine', 180, 120, 0.05, 0.15);
  }
  land(intensity = 1) {
    this._burst('lowpass', 180, 0.9, Math.min(0.5, 0.15 + intensity * 0.06), 0.005, 0.35);
  }
  click(v = 0.2) {
    this._burst('highpass', 4000, 0.5, v, 0.001, 0.02);
  }
  ui() {
    this._tone('triangle', 880, 660, 0.06, 0.08);
  }
  radio() {
    this._tone('square', 1400, 1400, 0.03, 0.05);
    this._tone('square', 1800, 1800, 0.03, 0.05, 0.08);
  }
  success() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone('triangle', f, f, 0.07, 0.25, i * 0.09));
  }
  warn() {
    [0, 0.25, 0.5].forEach((d) => this._tone('square', 740, 520, 0.05, 0.18, d));
  }
  hurt() {
    this._tone('sawtooth', 220, 90, 0.08, 0.25);
  }
  thud(v = 1) {
    this._burst('lowpass', 120, 1, Math.min(0.6, 0.2 * v), 0.01, 0.5);
  }
  beep(f = 1200) {
    this._tone('sine', f, f, 0.06, 0.09);
  }
  hatch() {
    this._burst('bandpass', 900, 2, 0.15, 0.02, 0.5);
    this._tone('sine', 300, 140, 0.08, 0.4);
  }
  transmit() {
    for (let i = 0; i < 8; i++) this._tone('sine', 1200 + (i % 2) * 400, 1200 + (i % 2) * 400, 0.04, 0.07, i * 0.1);
  }
  // ---- stereo Morse beacons (NASA pioneers: OPPY, SPRT, INST, INGN) ----
  /** list: [{ id, code, freq, gain, pan }] updated every frame; beeps are scheduled ahead on the audio clock. */
  setBeacons(list) {
    this._beacons = list || [];
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._bst = this._bst || {};
    const live = new Set();
    for (const b of this._beacons) {
      live.add(b.id);
      let st = this._bst[b.id];
      if (!st) st = this._bst[b.id] = { seq: this._morseSeq(b.code), i: 0, at: now + 0.05 };
      if (st.at < now - 0.5) st.at = now + 0.02; // resync after a stall
      while (st.at < now + 0.12) {
        const step = st.seq[st.i];
        if (step.on) this._beaconBeep(st.at, step.d, b);
        st.at += step.d;
        st.i = (st.i + 1) % st.seq.length;
      }
    }
    for (const id of Object.keys(this._bst)) if (!live.has(id)) delete this._bst[id];
  }

  _morseSeq(code) {
    return morseSequence(code, MORSE_UNIT);
  }

  _beaconBeep(at, dur, b) {
    if (!(b.gain > 0.003)) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = b.freq;
    const g = c.createGain();
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) pan.pan.value = b.pan;
    o.connect(g);
    if (pan) g.connect(pan).connect(this.master);
    else g.connect(this.master);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(b.gain, at + 0.008);
    g.gain.setValueAtTime(b.gain, at + Math.max(0.01, dur - 0.012));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  stopAll() {
    if (!this.ctx) return;
    for (const k of Object.keys(this._loops)) this._set(k, 0, 0.05);
    this._bst = {};
  }
}

export const audio = new AudioSynth();
