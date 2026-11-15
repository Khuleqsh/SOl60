// SOL 60 — on-screen touch / pointer controls for tablets and touch laptops (toggle in Settings).
// Left: virtual thumbstick. Right: action buttons. Drag anywhere else on the right half to look around.

import { useRef, useState } from 'react';

/**
 * sink: { move(x, y) — stick in [-1, 1] (y up = forward), press(action, down), look(dx, dy) — pixels }.
 */
export default function TouchControls({ sink }) {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef(null);
  const lookId = useRef(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);

  const stick = (e) => {
    const r = base.current.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R;
    let y = (e.clientY - (r.top + R)) / R;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    setKnob({ x, y });
    sink.move(Math.abs(x) < 0.15 ? 0 : x, Math.abs(y) < 0.15 ? 0 : -y);
  };
  const endStick = () => {
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    sink.move(0, 0);
  };

  const Btn = ({ action, label, hold = true, className = '' }) => (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        sink.press(action, true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (hold) sink.press(action, false);
      }}
      onPointerCancel={() => hold && sink.press(action, false)}
      className={`pointer-events-auto grid h-16 w-16 select-none place-items-center rounded-full border-2 border-white/40 bg-black/40 text-[11px] font-bold text-white backdrop-blur active:bg-amber-400/40 ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10 touch-none select-none">
      {/* look area: right half */}
      <div
        className="pointer-events-auto absolute bottom-0 right-0 top-24 w-1/2"
        aria-hidden="true"
        onPointerDown={(e) => {
          lookId.current = e.pointerId;
          lookLast.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookId.current !== e.pointerId) return;
          sink.look(e.clientX - lookLast.current.x, e.clientY - lookLast.current.y);
          lookLast.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (lookId.current = null)}
        onPointerCancel={() => (lookId.current = null)}
      />
      {/* thumbstick */}
      <div
        ref={base}
        role="group"
        aria-label="Movement thumbstick"
        className="pointer-events-auto absolute bottom-44 left-6 h-36 w-36 rounded-full border-2 border-white/30 bg-black/30 backdrop-blur"
        onPointerDown={(e) => {
          stickId.current = e.pointerId;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          stick(e);
        }}
        onPointerMove={(e) => stickId.current === e.pointerId && stick(e)}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/70 shadow" style={{ transform: `translate(calc(-50% + ${knob.x * 44}px), calc(-50% + ${knob.y * 44}px))` }} />
      </div>
      {/* actions */}
      <div className="absolute bottom-44 right-6 grid grid-cols-3 gap-2">
        <Btn action="piton" label="PITON" hold={false} />
        <Btn action="interact" label="USE" />
        <Btn action="jump" label="JUMP" hold={false} className="h-20 w-20 border-amber-300/70" />
        <Btn action="crouch" label="LET GO" />
        <button
          aria-pressed={sprint}
          aria-label="Sprint toggle"
          onPointerDown={(e) => {
            e.stopPropagation();
            const v = !sprint;
            setSprint(v);
            sink.press('sprint', v);
          }}
          className={`pointer-events-auto grid h-16 w-16 place-items-center rounded-full border-2 text-[11px] font-bold ${sprint ? 'border-amber-300 bg-amber-400/40' : 'border-white/40 bg-black/40'} text-white`}
        >
          SPRINT
        </button>
        <Btn action="codex" label="CODEX" hold={false} />
      </div>
    </div>
  );
}
