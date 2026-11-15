// SOL 60 — Morse code timing shared by the audio beacons and the on-screen captions (Deaf / hard-of-hearing support).

export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
};
export const MORSE_UNIT = 0.085; // seconds per dit

/** Audio/caption step list: { on, d, ch, sym } — tone on/off with duration; ch = letter index, sym = '.' | '-'. */
export function morseSequence(code, unit = MORSE_UNIT) {
  const seq = [];
  [...code].forEach((letter, ch) => {
    const m = MORSE[letter.toUpperCase()] || '.';
    for (const sym of m) {
      seq.push({ on: true, d: sym === '.' ? unit : unit * 3, ch, sym });
      seq.push({ on: false, d: unit, ch, sym: '' });
    }
    seq.push({ on: false, d: unit * 2, ch, sym: ' ' });
  });
  seq.push({ on: false, d: unit * 12, ch: code.length, sym: '' });
  return seq;
}

export const sequenceDuration = (seq) => seq.reduce((s, x) => s + x.d, 0);

/**
 * Caption state for a looping beacon at time t: is the tone on right now, which letter is being keyed, the
 * letters decoded so far this cycle and the dits/dahs of the current letter. Drives the visual beacon HUD.
 */
export function morseStateAt(code, t, unit = MORSE_UNIT) {
  const seq = morseSequence(code, unit);
  const T = sequenceDuration(seq);
  let u = ((t % T) + T) % T;
  for (const step of seq) {
    if (u < step.d) {
      const ch = Math.min(step.ch, code.length);
      const letter = code[ch] || '';
      let keyed = '';
      if (letter) {
        // symbols of the current letter already sent (including the one sounding now)
        let acc = 0;
        for (const s of seq) {
          if (s.ch !== ch) continue;
          if (s.on) keyed += s.sym;
          acc += s.d;
          if (s === step) break;
        }
      }
      return { on: step.on, letterIndex: ch, decoded: code.slice(0, ch), current: letter, keyed, morse: letter ? MORSE[letter] : '', cycle: T };
    }
    u -= step.d;
  }
  return { on: false, letterIndex: code.length, decoded: code, current: '', keyed: '', morse: '', cycle: T };
}

/** Full Morse spelling for a callsign, e.g. OPPY -> "--- .--. .--. -.--". */
export const toMorse = (code) => [...code].map((c) => MORSE[c.toUpperCase()] || '?').join(' ');

/** Compass bearing (degrees clockwise from north = -Z) and relative bearing to the camera heading. */
export function bearingTo(fromX, fromZ, toX, toZ, camYaw = 0) {
  const abs = Math.atan2(toX - fromX, -(toZ - fromZ));
  const heading = -camYaw;
  let rel = abs - heading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const deg = ((abs * 180) / Math.PI + 360) % 360;
  return { deg, rel };
}
