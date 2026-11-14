import { useEffect, useRef, useState } from 'react';
import { ArchiveViewer } from '../three/ArchiveViewer.js';
import { ARCHIVE, ARCHIVE_BY_ID } from '../game/data.js';
import { Modal, Tag, Toggle } from './common.jsx';

export function ArchiveModal({ onClose, onLunar }) {
  const box = useRef(null);
  const viewer = useRef(null);
  const [group, setGroup] = useState('mars');
  const [id, setId] = useState('opportunity');
  const [level, setLevel] = useState('youth');
  const [dust, setDust] = useState(0.5);
  const [xray, setXray] = useState(false);
  const a = ARCHIVE_BY_ID[id];

  useEffect(() => {
    const v = new ArchiveViewer(box.current);
    viewer.current = v;
    v.show('opportunity');
    v.setDust(0.5);
    return () => v.dispose();
  }, []);
  useEffect(() => viewer.current?.show(id), [id]);
  useEffect(() => viewer.current?.setDust(dust), [dust, id]);
  useEffect(() => viewer.current?.setXRay(xray), [xray, id]);

  const pick = (g) => {
    setGroup(g);
    setId(ARCHIVE.find((x) => x.group === g).id);
    if (g === 'moon') onLunar?.();
  };

  return (
    <Modal onClose={onClose} wide className="archive">
      <div className="eyebrow">MOON-TO-MARS · NASA HARDWARE ARCHIVE</div>
      <div className="tabs">
        <button type="button" className={group === 'mars' ? 'on' : ''} onClick={() => pick('mars')}>
          Mars Hardware
        </button>
        <button type="button" className={group === 'moon' ? 'on' : ''} onClick={() => pick('moon')}>
          Lunar Heritage (Moon)
        </button>
      </div>
      <div className="archive-grid">
        <div>
          <div className="chip-row">
            {ARCHIVE.filter((x) => x.group === group).map((x) => (
              <button type="button" key={x.id} className={`chip ${id === x.id ? 'on' : ''}`} onClick={() => setId(x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <div ref={box} className="archive-view" />
          <label className="field">
            <span>
              HiRISE Orbital Time-Slider <small>Landing Sol → Final Sol</small> <Tag k="hirise" inline />
            </span>
            <input type="range" min="0" max="1" step="0.01" value={dust} onChange={(e) => setDust(+e.target.value)} />
          </label>
          <div className="slider-ends mono">
            <span>{a.landed}</span>
            <span>{Math.round(dust * 100)}% dust cover</span>
            <span>{a.final}</span>
          </div>
          <Toggle on={xray} onClick={() => setXray(!xray)}>
            X-Ray internals
          </Toggle>
        </div>
        <div className="archive-text">
          <h2>{a.name}</h2>
          <div className="mono coords">
            {a.coords} <Tag k={group === 'moon' ? 'alsep' : 'pds'} inline />
          </div>
          <div className="tabs small">
            <button type="button" className={level === 'youth' ? 'on' : ''} onClick={() => setLevel('youth')}>
              Youth Explorer
            </button>
            <button type="button" className={level === 'engineer' ? 'on' : ''} onClick={() => setLevel('engineer')}>
              NASA Engineer
            </button>
          </div>
          <p>{a[level]}</p>
          <div className="panel-head">Discoveries</div>
          <ul>
            {a.discoveries.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {group === 'moon' && (
            <p className="note">
              Moon-to-Mars: Apollo 12 landed 163 m from Surveyor 3. The parts the crew brought home, and the ALSEP dust detector they left running, gave NASA its first hard numbers on how dust degrades
              optics, coatings and solar cells. Those numbers shaped the dust margins of every Mars rover.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
