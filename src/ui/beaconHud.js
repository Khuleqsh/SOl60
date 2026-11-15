// SOL 60 — visual beacon indicator for the pioneer Morse beacons (accessibility: Deaf / hard-of-hearing players).
// Drawn every other frame from the game loop: a bearing arc pointing at each beacon, a waveform that pulses with
// every dit and dah, and a live Morse-to-text caption.

import { toMorse } from '../logic/morse.js';

/** list: [{ code, name, dist, strength 0..1, rel (radians, + = right), deg, morse: morseStateAt(...) }]. */
export function drawBeacons(canvas, textEl, list, t) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  g.clearRect(0, 0, W, H);
  if (!list || !list.length) {
    if (textEl && textEl.textContent) textEl.textContent = '';
    return;
  }
  const cx = W / 2;
  const cy = H - 6;
  const R = H - 14;
  // bearing arc (front half-circle = 180° field of view)
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(200,225,245,0.25)';
  g.beginPath();
  g.arc(cx, cy, R, Math.PI, 0);
  g.stroke();
  const colors = ['#ffb020', '#58e1ff'];
  list.forEach((b, i) => {
    const col = colors[i % 2];
    const rel = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, b.rel));
    const behind = Math.abs(b.rel) > Math.PI / 2;
    const a = -Math.PI / 2 + rel;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    const on = b.morse.on;
    // pulse ring: bright while the tone is keyed, sized by signal strength
    g.globalAlpha = 0.35 + 0.65 * b.strength;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, on ? 7 + b.strength * 5 : 4, 0, Math.PI * 2);
    g.fill();
    if (on) {
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 12 + ((t * 30) % 8), 0, Math.PI * 2);
      g.stroke();
    }
    // bearing needle from the centre
    g.globalAlpha = 0.5 * (0.4 + b.strength);
    g.strokeStyle = col;
    g.setLineDash(behind ? [3, 3] : []);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(x, y);
    g.stroke();
    g.setLineDash([]);
    // waveform strip
    g.globalAlpha = 1;
    const wx = i === 0 ? 6 : W - 86;
    g.strokeStyle = col;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let k = 0; k <= 80; k++) {
      const amp = on ? 6 * (0.4 + b.strength) : 0.6;
      const yy = 14 + Math.sin(k * 0.9 + t * 40) * amp;
      if (k === 0) g.moveTo(wx + k, yy);
      else g.lineTo(wx + k, yy);
    }
    g.stroke();
    g.fillStyle = col;
    g.font = '600 10px ui-monospace, Consolas, monospace';
    g.textAlign = i === 0 ? 'left' : 'right';
    g.fillText(`${b.code} ${Math.round(b.dist)}m ${behind ? '(behind)' : ''}`, i === 0 ? wx : wx + 80, 34);
  });
  g.globalAlpha = 1;
  if (textEl) {
    const b = list[0];
    const m = b.morse;
    const txt = `♪ ${b.code} (${b.name}) · ${m.decoded}${m.current ? `[${m.current}] ${m.keyed}` : ''} · ${toMorse(b.code)} · bearing ${Math.round(b.deg)}°`;
    if (textEl.textContent !== txt) textEl.textContent = txt;
  }
}
