import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

const FULL: [number, number, number, number] = [0, 0, 1000, 420];
/** Reglerstellung als Uhrzeit: 0 = 7 Uhr, 0,5 = 12 Uhr, 1 = 5 Uhr. */
export const clock = (v: number) => { const h = Math.round(7 + v * 10); return `${h > 12 ? h - 12 : h} Uhr`; };
const faderWord = (v: number) => (v <= 0.02 ? "unten" : v >= 0.98 ? "oben" : `${Math.round(v * 10)}/10`);

/** Schematische Draufsicht des DDJ-FLX4 mit hervorhebbaren und (optional) anklickbaren Bedienelementen. */
interface Props {
  /** Hervorgehobene Bedienelemente (Akzentfarbe, pulsierend). */
  active: string[];
  /** Bereits richtig gefundene Elemente im Übungsmodus (grün). */
  done?: string[];
  /** Zuletzt falsch angeklicktes Element (rot). */
  wrong?: string | null;
  /** Macht die Bedienelemente anklickbar. */
  onPick?: (id: string) => void;
  /** Reglerstellungen 0…1 je Bedienelement: Drehregler drehen sich (7 bis 5 Uhr), Fader wandern. */
  values?: Record<string, number>;
  /** Bedienelemente, auf die die Ansicht weich heranfährt; der Rest wird abgedunkelt. */
  focus?: string[];
  /** Geplante Bewegung je Regler: zeichnet Richtungspfeil und „von → nach“. */
  motion?: Record<string, { from: number; to: number }>;
}

export function Flx4({ active, done = [], wrong, onPick, values, focus, motion }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState(FULL);
  const boxRef = useRef(FULL);
  const focusKey = (focus ?? []).join(",");

  // Fokus-Zoom: Zielausschnitt aus den Positionen der Bedienelemente, weich angefahren
  useEffect(() => {
    const el = svg.current;
    let target = FULL;
    if (el && focus && focus.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const id of focus) {
        const g = el.querySelector<SVGGElement>(`g[data-id="${id}"]`);
        if (!g) continue;
        const b = g.getBBox();
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      if (x1 > x0) {
        const ratio = 1000 / 420;
        let w = Math.max(x1 - x0 + 150, 430), h = Math.max(y1 - y0 + 110, 430 / ratio);
        if (w / h < ratio) w = h * ratio; else h = w / ratio;
        w = Math.min(w, 1000); h = Math.min(h, 420);
        const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
        target = [Math.min(Math.max(0, cx0 - w / 2), 1000 - w), Math.min(Math.max(0, cy0 - h / 2), 420 - h), w, h];
      }
    }
    const from = boxRef.current;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now(), dur = reduced ? 1 : 700;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const next = from.map((v, i) => v + (target[i] - v) * e) as typeof FULL;
      boxRef.current = next;
      setBox(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomed = box[2] < 960;

  const val = (id: string, fallback: number) => Math.min(1, Math.max(0, values?.[id] ?? fallback));
  const bind = (id: string) => ({
    className: cx("flx", active.includes(id) && "flx-on", done.includes(id) && "flx-done", wrong === id && "flx-wrong", onPick && "flx-pick"),
    "data-id": id,
    onClick: onPick ? () => onPick(id) : undefined,
  });

  const Knob = ({ id, x, y, label, r = 13 }: { id: string; x: number; y: number; label: string; r?: number }) => (
    <g {...bind(id)}>
      <circle cx={x} cy={y} r={r} className="flx-shape" />
      <line x1={x} y1={y - r + 3} x2={x} y2={y - 3} className="flx-mark" transform={`rotate(${-150 + val(id, 0.5) * 300} ${x} ${y})`} style={{ transition: "transform 0.12s linear" }} />
      {[0, 0.25, 0.5, 0.75, 1].map((v) => { const a = ((-150 + v * 300) * Math.PI) / 180; return <line key={v} x1={x + Math.sin(a) * (r + 2)} y1={y - Math.cos(a) * (r + 2)} x2={x + Math.sin(a) * (r + 4.5)} y2={y - Math.cos(a) * (r + 4.5)} className="flx-tick" />; })}
      <text x={x} y={y + r + 11} className="flx-label">{label}</text>
      {motion?.[id] && <KnobArrow x={x} y={y} r={r + 8} from={motion[id].from} to={motion[id].to} />}
    </g>
  );
  const Btn = ({ id, x, y, w, h = 18, label, round }: { id: string; x: number; y: number; w: number; h?: number; label: string; round?: boolean }) => (
    <g {...bind(id)}>
      <rect x={x} y={y} width={w} height={h} rx={round ? h / 2 : 4} className="flx-shape" />
      <text x={x + w / 2} y={y + h / 2 + 3} className="flx-label flx-in">{label}</text>
    </g>
  );
  const Fader = ({ id, x, y, h, label }: { id: string; x: number; y: number; h: number; label: string }) => (
    <g {...bind(id)}>
      <rect x={x - 2} y={y} width={4} height={h} rx={2} className="flx-track" />
      <rect x={x - 11} y={y + (1 - val(id, 0.45)) * (h - 12)} width={22} height={12} rx={3} className="flx-shape" style={{ transition: "y 0.12s linear" }} />
      <text x={x} y={y + h + 13} className="flx-label">{label}</text>
      {motion?.[id] && (() => {
        const ya = y + 6 + (1 - motion[id].from) * (h - 12), yb = y + 6 + (1 - motion[id].to) * (h - 12), dir = yb < ya ? -1 : 1;
        return <g className="flx-arrow"><line x1={x + 17} y1={ya} x2={x + 17} y2={yb - dir * 4} /><path d={`M${x + 13},${yb - dir * 5} L${x + 21},${yb - dir * 5} L${x + 17},${yb} Z`} className="flx-arrowhead" /><text x={x + 24} y={(ya + yb) / 2 + 3} className="flx-value" style={{ textAnchor: "start" }}>{faderWord(motion[id].from)} → {faderWord(motion[id].to)}</text></g>;
      })()}
    </g>
  );

  const Deck = ({ n, ox }: { n: 1 | 2; ox: number }) => (
    <g>
      <rect x={ox} y={12} width={330} height={396} rx={14} className="flx-panel" />
      <text x={ox + 16} y={34} className="flx-title">DECK {n}</text>
      {/* Loop-Sektion */}
      <Btn id={`loopcall_${n}`} x={ox + 16} y={48} w={62} label="CUE/LOOP ◀▶" />
      <Btn id={`loopin_${n}`} x={ox + 84} y={48} w={30} label="IN" />
      <Btn id={`loopout_${n}`} x={ox + 119} y={48} w={34} label="OUT" />
      <Btn id={`loop4_${n}`} x={ox + 158} y={48} w={70} label="4 BEAT/EXIT" />
      <Btn id={`sync_${n}`} x={ox + 250} y={48} w={64} label="BEAT SYNC" />
      {/* Jogwheel */}
      <g {...bind(`jog_${n}`)}>
        <circle cx={ox + 140} cy={176} r={84} className="flx-shape" />
        <circle cx={ox + 140} cy={176} r={58} className="flx-inner" />
        <text x={ox + 140} y={180} className="flx-label flx-in">JOG</text>
      </g>
      <Fader id={`tempo_${n}`} x={ox + 284} y={92} h={160} label="TEMPO" />
      {/* Transport */}
      <g {...bind(`cue_${n}`)}>
        <circle cx={ox + 40} cy={306} r={19} className="flx-shape" />
        <text x={ox + 40} y={310} className="flx-label flx-in">CUE</text>
      </g>
      <g {...bind(`play_${n}`)}>
        <circle cx={ox + 40} cy={362} r={19} className="flx-shape" />
        <text x={ox + 40} y={366} className="flx-label flx-in">▶ / ❚❚</text>
      </g>
      {/* Performance-Pads */}
      <text x={ox + 84} y={282} className="flx-caption">HOT CUE · PADS</text>
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} {...bind(`pad${i + 1}_${n}`)}>
          <rect x={ox + 84 + (i % 4) * 58} y={290 + Math.floor(i / 4) * 52} width={50} height={44} rx={6} className="flx-shape" />
          <text x={ox + 109 + (i % 4) * 58} y={316 + Math.floor(i / 4) * 52} className="flx-label flx-in">{i + 1}</text>
        </g>
      ))}
    </g>
  );

  const Channel = ({ n, x }: { n: 1 | 2; x: number }) => (
    <g>
      <Btn id={`load_${n}`} x={x - 22} y={22} w={44} label={`LOAD ${n}`} />
      <Knob id={`trim_${n}`} x={x} y={66} label="TRIM" />
      <Knob id={`hi_${n}`} x={x} y={112} label="HI" />
      <Knob id={`mid_${n}`} x={x} y={158} label="MID" />
      <Knob id={`low_${n}`} x={x} y={204} label="LOW" />
      <Knob id={`cfx_${n}`} x={x} y={252} label="CFX" r={15} />
      <Btn id={`hpcue_${n}`} x={x - 20} y={284} w={40} label="🎧 CUE" round />
      <Fader id={`fader_${n}`} x={x} y={310} h={62} label="" />
    </g>
  );

  return (
    <div className="relative">
    <svg ref={svg} viewBox={box.map((v) => v.toFixed(1)).join(" ")} className={cx("block w-full", zoomed && "flx-zoomed")} style={{ aspectRatio: "1000 / 420" }} role="img" aria-label="Schema des DDJ-FLX4 mit hervorgehobenen Bedienelementen">
      <rect x={2} y={2} width={996} height={416} rx={20} className="flx-body" />
      <Deck n={1} ox={12} />
      <Deck n={2} ox={658} />
      {/* Mixer */}
      <rect x={352} y={12} width={296} height={396} rx={14} className="flx-panel" />
      <Channel n={1} x={456} />
      <Channel n={2} x={544} />
      <g {...bind("browse")}>
        <circle cx={500} cy={31} r={11} className="flx-shape" />
        <text x={500} y={56} className="flx-label">BROWSE</text>
      </g>
      <text x={500} y={316} className="flx-caption" textAnchor="middle">KANALFADER</text>
      <Btn id="smart_fader" x={364} y={300} w={62} label="SMART FADER" />
      <Btn id="smart_cfx" x={364} y={244} w={62} label="SMART CFX" />
      <Knob id="master" x={395} y={66} label="MASTER" />
      <Knob id="hpmix" x={395} y={130} label="🎧 MIX" />
      <Knob id="hplevel" x={395} y={190} label="🎧 LEVEL" />
      {/* Beat FX */}
      <text x={605} y={34} className="flx-title" textAnchor="middle">BEAT FX</text>
      <Btn id="beatfx_beat" x={577} y={46} w={56} label="BEAT ◀ ▶" />
      <Btn id="beatfx_select" x={577} y={76} w={56} label="SELECT" />
      <Btn id="beatfx_ch" x={577} y={106} w={56} label="CH 1·2·M" />
      <Knob id="beatfx_depth" x={605} y={162} label="LEVEL/DEPTH" r={15} />
      <g {...bind("beatfx_onoff")}>
        <circle cx={605} cy={226} r={18} className="flx-shape" />
        <text x={605} y={230} className="flx-label flx-in">ON/OFF</text>
      </g>
      <g {...bind("crossfader")}>
        <rect x={430} y={390} width={140} height={4} rx={2} className="flx-track" />
        <rect x={430 + val("crossfader", 0.5) * 116} y={381} width={24} height={22} rx={4} className="flx-shape" style={{ transition: "x 0.12s linear" }} />
        {motion?.crossfader && (() => {
          const xa = 442 + motion.crossfader.from * 116, xb = 442 + motion.crossfader.to * 116, dir = xb < xa ? -1 : 1;
          return <g className="flx-arrow"><line x1={xa} y1={374} x2={xb - dir * 4} y2={374} /><path d={`M${xb - dir * 5},370 L${xb - dir * 5},378 L${xb},374 Z`} className="flx-arrowhead" /></g>;
        })()}
      </g>
    </svg>
    {zoomed && (
      <div className="pointer-events-none absolute top-1.5 right-1.5 h-[34px] w-[80px] rounded border border-line bg-bg/80" aria-hidden title="Ausschnitt des Controllers">
        <div className="absolute rounded-[2px] border border-accent bg-accent-soft" style={{ left: `${box[0] / 10}%`, top: `${box[1] / 4.2}%`, width: `${box[2] / 10}%`, height: `${box[3] / 4.2}%` }} />
      </div>
    )}
    </div>
  );
}

/** Bogenpfeil um einen Drehregler von der Start- zur Zielstellung, mit Beschriftung. */
function KnobArrow({ x, y, r, from, to }: { x: number; y: number; r: number; from: number; to: number }) {
  const ang = (v: number) => ((-150 + v * 300) * Math.PI) / 180;
  const pt = (v: number, rr = r) => [x + Math.sin(ang(v)) * rr, y - Math.cos(ang(v)) * rr];
  const [x0, y0] = pt(from), [x1, y1] = pt(to);
  const large = Math.abs(to - from) * 300 > 180 ? 1 : 0, sweep = to > from ? 1 : 0;
  const back = to + (from > to ? 0.035 : -0.035);
  const [bx0, by0] = pt(back, r - 3.5), [bx1, by1] = pt(back, r + 3.5);
  return (
    <g className="flx-arrow">
      <path d={`M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} ${sweep} ${x1.toFixed(1)},${y1.toFixed(1)}`} fill="none" />
      <path d={`M${bx0.toFixed(1)},${by0.toFixed(1)} L${bx1.toFixed(1)},${by1.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} Z`} className="flx-arrowhead" />
      <text x={x} y={y - r - 5} className="flx-value">{clock(from)} → {clock(to)}</text>
    </g>
  );
}
