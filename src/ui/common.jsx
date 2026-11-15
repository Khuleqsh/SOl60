// SOL 60 — small shared UI pieces with no Three.js dependency (safe for the title-screen bundle).

import { Component } from 'react';
import { SCALE_NOTICE, scaleFacts } from '../data/nasaDatasets.js';
import { CRATER, OLYMPUS, MT_SHARP } from '../data/nasaData.js';

export function KeyCap({ children }) {
  return <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">{children}</kbd>;
}

export const keyLabel = (code) =>
  (code || '')
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ShiftLeft', 'Shift')
    .replace('ShiftRight', 'R-Shift')
    .replace('ControlLeft', 'Ctrl')
    .replace('Arrow', '');

/** External source link: always opens in a new tab without giving the target page access to this window. */
export function SourceLink({ source, className = '', children }) {
  if (!source?.url) return null;
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className={`text-cyan-300 underline decoration-cyan-300/40 underline-offset-2 hover:text-cyan-100 ${className}`}>
      {children || source.label} <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The scientific-honesty disclosure. `compact` = one line; otherwise a table of real vs. in-game measurements,
 * computed from the game's actual layout constants, with a source link per row.
 */
export function ScaleNotice({ compact = false, className = '' }) {
  if (compact) {
    return (
      <div role="note" className={`rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[12px] text-amber-100 ${className}`}>
        <b>⚠ {SCALE_NOTICE}.</b> Olympus Mons is really ~21.9 km tall and ~624 km wide in the Tharsis region, ~5,300 km from Gale Crater (154 km wide, Mount Sharp 5.5 km high).
      </div>
    );
  }
  const rows = scaleFacts({ CRATER, OLYMPUS, MT_SHARP });
  return (
    <section role="note" aria-label="Scale disclosure" className={`rounded-xl border border-amber-300/40 bg-amber-400/[0.07] p-3 text-[12px] text-amber-50 ${className}`}>
      <div className="font-bold text-amber-200">⚠ {SCALE_NOTICE}</div>
      <p className="mt-1 text-amber-100/80">Gale Crater and Olympus Mons are combined into one 1.2 km mission zone. Geology, weather and physics follow NASA data; distances and heights are compressed.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="text-amber-200/80">
            <tr>
              <th className="py-0.5 pr-2 font-semibold">Feature</th>
              <th className="py-0.5 pr-2 font-semibold">Real (NASA)</th>
              <th className="py-0.5 pr-2 font-semibold">In game</th>
              <th className="py-0.5 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-amber-200/10">
                <td className="py-0.5 pr-2">{r.label}</td>
                <td className="py-0.5 pr-2">{r.real}</td>
                <td className="py-0.5 pr-2">
                  {r.game} <span className="text-amber-200/60">(÷{r.factor.toLocaleString('en-US')})</span>
                </td>
                <td className="py-0.5">
                  <SourceLink source={r.source}>link</SourceLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Catches render errors in a stage so a 3D failure shows a readable message instead of a black screen. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[SOL 60] stage crashed', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-slate-200">
        <div className="max-w-md">
          <h2 className="text-xl font-bold text-red-300">This stage hit a problem</h2>
          <p className="mt-2 text-sm text-slate-400">{String(this.state.error?.message || this.state.error)}</p>
          <p className="mt-2 text-sm text-slate-400">Your settings are saved. You can return to the title screen and try again, or pick the Low graphics preset.</p>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
            className="mt-4 rounded-lg bg-amber-400 px-4 py-2 font-bold text-black hover:bg-amber-300"
          >
            Back to title
          </button>
        </div>
      </div>
    );
  }
}

export function StageLoading({ label = 'Loading 3D mission systems…' }) {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center bg-black text-slate-300">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300 motion-reduce:animate-none" />
        <div className="mt-3 font-mono text-[12px] tracking-widest">{label}</div>
        <ScaleNotice compact className="mx-auto mt-4 max-w-lg text-left" />
      </div>
    </div>
  );
}
