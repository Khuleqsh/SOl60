import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { NASA_DATA, ADVISORS } from '../game/data.js';
import { audio } from '../audio/audio.js';

export const UIContext = createContext({ dataTags: false });
export const useUI = () => useContext(UIContext);

export function useInterval(fn, ms, deps = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return undefined;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

// [NASA DATA SOURCE] badge, shown only when the Telemetry Inspector is on.
export function Tag({ k, inline = false }) {
  const { dataTags } = useUI();
  if (!dataTags || !NASA_DATA[k]) return null;
  return (
    <span className={`nasa-tag ${inline ? 'inline' : ''}`} title={NASA_DATA[k].cite}>
      [{NASA_DATA[k].tag}]
    </span>
  );
}

export function Btn({ children, onClick, tone = 'cyan', disabled, className = '', title, small, ...rest }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`btn btn-${tone} ${small ? 'btn-sm' : ''} ${className}`}
      onMouseEnter={() => !disabled && audio.hover()}
      onClick={(e) => {
        if (disabled) return;
        audio.init();
        audio.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ on, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => {
        audio.init();
        audio.click();
        onClick?.();
      }}
    >
      <span className="dot" />
      {children}
    </button>
  );
}

export function Gauge({ label, value, max = 100, unit = '', tone, warn, crit, invert, sub, tag, fmt }) {
  const pct = Math.max(0, Math.min(1, value / max));
  let t = tone;
  if (!t) {
    const v = invert ? 1 - pct : pct;
    t = v < (crit ?? 0.2) ? 'crimson' : v < (warn ?? 0.45) ? 'amber' : 'cyan';
  }
  return (
    <div className={`gauge tone-${t}`}>
      <div className="gauge-head">
        <span>{label}</span>
        <span className="mono">
          {fmt ? fmt(value) : Math.round(value)}
          {unit}
        </span>
      </div>
      <div className="gauge-bar">
        <div style={{ width: `${pct * 100}%` }} />
      </div>
      {sub && <div className="gauge-sub">{sub}</div>}
      {tag && <Tag k={tag} />}
    </div>
  );
}

export function Panel({ title, children, className = '', right, tag }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel-head">
          <span>{title}</span>
          {tag && <Tag k={tag} inline />}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Modal({ children, onClose, wide, className = '', tone = 'cyan' }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal tone-${tone} ${wide ? 'wide' : ''} ${className}`}>
        {onClose && (
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Tooltip({ text }) {
  return <div className="stage-tip">{text}</div>;
}

// Advisor radio popups. queue: [{id, who, text}]
export function AdvisorRadio({ queue, onDismiss }) {
  return (
    <div className="radio-stack">
      {queue.slice(-3).map((m) => {
        const a = ADVISORS[m.who];
        return (
          <div key={m.id} className="radio" style={{ '--adv': a.color }} onClick={() => onDismiss(m.id)}>
            <div className="radio-portrait">
              <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
                <circle cx="20" cy="20" r="19" fill="#0b1220" stroke={a.color} strokeWidth="2" />
                <circle cx="20" cy="16" r="7" fill={a.color} opacity="0.85" />
                <path d="M8 34c2-7 8-10 12-10s10 3 12 10" fill={a.color} opacity="0.6" />
                <rect x="27" y="9" width="6" height="3" rx="1" fill="#e2e8f0" />
              </svg>
              <span className="radio-init">{a.initials}</span>
            </div>
            <div>
              <div className="radio-who">
                {a.name} · <span>{a.role}</span>
              </div>
              <div className="radio-text">{m.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

let radioId = 1;
export function useRadio(timeout = 7000) {
  const [queue, setQueue] = useState([]);
  const last = useRef({});
  const push = (msg) => {
    if (!msg) return;
    const key = msg.who + msg.text;
    const now = Date.now();
    if (last.current[key] && now - last.current[key] < 20000) return;
    last.current[key] = now;
    const id = radioId++;
    audio.telemetry();
    setQueue((q) => [...q.slice(-4), { ...msg, id }]);
    setTimeout(() => setQueue((q) => q.filter((m) => m.id !== id)), timeout);
  };
  const dismiss = (id) => setQueue((q) => q.filter((m) => m.id !== id));
  return { queue, push, dismiss };
}

export function PatchImg({ src, size = 40, className = '' }) {
  if (!src) return null;
  return <img src={src} width={size} height={size} alt="Mission patch" className={`patch-img ${className}`} />;
}

export function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  } catch {
    /* fall through */
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label = 'Copy', done = 'Copied' }) {
  const [ok, setOk] = useState(false);
  return (
    <Btn
      small
      onClick={() =>
        copyText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        })
      }
    >
      {ok ? done : label}
    </Btn>
  );
}
