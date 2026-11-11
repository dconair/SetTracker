import { useState } from "react";
import { cx } from "./ui";

const A = "var(--wave-low)";
const B = "var(--wave-mid)";

// ------------------------------------------------------------------ Regler-Verlauf eines Übergangs
type Pts = [number, number][];
interface Lane { label: string; hint?: string; a?: Pts; b?: Pts; band?: [number, number, string] }

/** Verlauf der wichtigsten Regler über den Übergang; x = 0…1 über die Überblend-Takte, y = 0…1. */
const LANES: Record<string, Lane[]> = {
  bass_swap: [
    { label: "Lautstärke", hint: "Kanalfader", a: [[0, 1], [0.5, 1], [1, 0]], b: [[0, 0], [0.5, 1], [1, 1]] },
    { label: "Bass", hint: "EQ LOW", a: [[0, 1], [0.5, 1], [0.5, 0], [1, 0]], b: [[0, 0], [0.5, 0], [0.5, 1], [1, 1]] },
    { label: "Mitten", hint: "EQ MID", a: [[0, 1], [0.5, 1], [0.7, 0.4], [1, 0.4]], b: [[0, 1], [1, 1]] },
  ],
  filter_fade: [
    { label: "Lautstärke", hint: "Kanalfader", a: [[0, 1], [0.5, 1], [1, 0]], b: [[0, 0.75], [0.5, 0.75], [1, 1]] },
    { label: "Filter", hint: "CFX · Mitte = neutral", a: [[0, 0.5], [0.5, 0.9], [1, 0.9]], b: [[0, 0.15], [0.5, 0.5], [1, 0.5]] },
  ],
  echo_out: [
    { label: "Lautstärke", hint: "Kanalfader", a: [[0, 1], [0.92, 1], [1, 0]], b: [[0, 0], [1, 0], [1, 1], [1.12, 1]] },
    { label: "Echo", hint: "BEAT FX auf A", band: [0, 1.06, "Echo an"] },
  ],
  loop_out: [
    { label: "Loop", hint: "4 BEAT/EXIT auf A", band: [0, 1, "letzter Takt als Schleife"] },
    { label: "Lautstärke", hint: "Kanalfader", a: [[0, 1], [0.5, 1], [1, 0]], b: [[0, 0], [0.5, 1], [1, 1]] },
    { label: "Bass", hint: "EQ LOW", a: [[0, 1], [0.5, 1], [0.5, 0], [1, 0]], b: [[0, 0], [0.5, 0], [0.5, 1], [1, 1]] },
  ],
  cut: [
    { label: "Lautstärke", hint: "Crossfader in einem Zug", a: [[0, 1], [1, 1], [1, 0], [1.12, 0]], b: [[0, 0], [1, 0], [1, 1], [1.12, 1]] },
  ],
  smart_fader: [
    { label: "Crossfader", hint: "gleichmäßig schieben", a: [[0, 1], [1, 0]], b: [[0, 0], [1, 1]] },
    { label: "Automatik", hint: "SMART FADER", band: [0, 1, "Tempo, Bass und Lautstärke werden angeglichen"] },
  ],
};

/**
 * Zeigt, wie sich die Regler über den Übergang bewegen – wie Automationsspuren.
 * `progress` (0…1 über die Überblend-Takte) setzt den Zeiger, `range` hebt einen Taktbereich hervor.
 */
export function MixLanes({ template, bars, progress, range }: { template: string; bars: number; progress?: number | null; range?: [number, number] | null }) {
  const lanes = LANES[template];
  if (!lanes) return null;
  const n = Math.max(bars, 1);
  const W = 640, left = 96, right = 14, laneH = 44, gap = 10, top = 20;
  const lead = 0.12;                                   // Vorlauf/Nachlauf links und rechts
  const x = (v: number) => left + ((v + lead) / (1 + 2 * lead)) * (W - left - right);
  const H = top + lanes.length * (laneH + gap) + 4;
  const path = (pts: Pts, y0: number) => {
    const all: Pts = [[-lead, pts[0][1]], ...pts, [1 + lead, pts[pts.length - 1][1]]];
    return all.map(([px, py], i) => `${i ? "L" : "M"}${x(Math.min(px, 1 + lead)).toFixed(1)},${(y0 + (1 - py) * (laneH - 8) + 4).toFixed(1)}`).join(" ");
  };
  const ticks = n <= 2 ? [0, n] : n <= 8 ? Array.from({ length: n + 1 }, (_, i) => i) : Array.from({ length: n / 4 + 1 }, (_, i) => i * 4);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Verlauf der Regler über den Übergang">
        {range && <rect x={x((range[0] - 1) / n)} y={top - 4} width={Math.max(3, x(range[1] / n) - x((range[0] - 1) / n))} height={H - top} rx={4} fill="var(--accent)" opacity={0.12} />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t / n)} x2={x(t / n)} y1={top - 4} y2={H} stroke="var(--line)" strokeWidth={1} />
            <text x={x(t / n)} y={11} textAnchor="middle" fontSize={9} fill="var(--faint)" fontWeight={600}>{t === n ? "Ende" : `Takt ${t + 1}`}</text>
          </g>
        ))}
        {lanes.map((lane, i) => {
          const y0 = top + i * (laneH + gap);
          return (
            <g key={lane.label}>
              <rect x={left - 4} y={y0} width={W - left - right + 4} height={laneH} rx={6} fill="var(--raised)" stroke="var(--line)" />
              <text x={0} y={y0 + 19} fontSize={11} fontWeight={600} fill="var(--text)">{lane.label}</text>
              {lane.hint && <text x={0} y={y0 + 32} fontSize={8.5} fill="var(--faint)">{lane.hint}</text>}
              {lane.band && <>
                <rect x={x(lane.band[0])} y={y0 + 10} width={x(lane.band[1]) - x(lane.band[0])} height={laneH - 20} rx={5} fill="var(--accent)" opacity={0.3} />
                <text x={(x(lane.band[0]) + x(lane.band[1])) / 2} y={y0 + laneH / 2 + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--text)">{lane.band[2]}</text>
              </>}
              {lane.a && <path d={path(lane.a, y0)} fill="none" stroke={A} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
              {lane.b && <path d={path(lane.b, y0)} fill="none" stroke={B} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="none" opacity={0.95} />}
            </g>
          );
        })}
        {progress !== null && progress !== undefined && progress >= -lead && progress <= 1 + lead && (
          <g>
            <line x1={x(progress)} x2={x(progress)} y1={top - 6} y2={H} stroke="var(--text)" strokeWidth={2} />
            <circle cx={x(progress)} cy={top - 6} r={4} fill="var(--text)" />
          </g>
        )}
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: A }} />Track A (läuft)</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: B }} />Track B (kommt)</span>
        <span className="text-faint">oben = voll auf · unten = zu</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Phrasen-Uhr
/** Eine Phrase als Kreis: 8 Takte mit je 4 Schlägen. Der Zeiger zeigt, wo du gerade bist. */
export function PhraseClock({ beatIndex, bars = 8, hidden }: { beatIndex: number; bars?: number; hidden?: boolean }) {
  const total = bars * 4;
  const pos = beatIndex < 0 ? -1 : beatIndex % total;
  const R = 78, C = 100;
  const pt = (i: number, r: number) => {
    const a = (i / total) * 2 * Math.PI - Math.PI / 2;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };
  return (
    <svg viewBox="0 0 200 200" className="block h-auto w-full max-w-[220px]" role="img" aria-label="Position in der Phrase">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeWidth={14} />
      {Array.from({ length: total }, (_, i) => {
        const [x1, y1] = pt(i, R - 7), [x2, y2] = pt(i, R + 7);
        const isBar = i % 4 === 0;
        const passed = !hidden && pos >= 0 && i <= pos;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={passed ? "var(--accent)" : isBar ? "var(--muted)" : "var(--faint)"} strokeWidth={i === pos && !hidden ? 5 : isBar ? 3 : 1.5} strokeLinecap="round" opacity={passed || isBar ? 1 : 0.6} />;
      })}
      {Array.from({ length: bars }, (_, b) => {
        const [tx, ty] = pt(b * 4 + 0.001, R - 24);
        return <text key={b} x={tx} y={ty + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={!hidden && Math.floor(pos / 4) === b ? "var(--accent)" : "var(--faint)"}>{b + 1}</text>;
      })}
      {(() => { const [mx, my] = pt(0, R + 16); return <text x={mx} y={my + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--accent)">DIE EINS</text>; })()}
      <text x={C} y={C - 2} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--text)">{hidden || pos < 0 ? "–" : pos % 4 + 1}</text>
      <text x={C} y={C + 15} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{hidden ? "selbst zählen" : pos < 0 ? "bereit" : `Takt ${Math.floor(pos / 4) + 1} von ${bars}`}</text>
    </svg>
  );
}

// ------------------------------------------------------------------ Bauplan eines Tracks
const BLUEPRINT: { name: string; bars: number; level: number; pad?: string; color: string }[] = [
  { name: "Intro", bars: 16, level: 0.35, pad: "1 · 5", color: "#3ecf8e" },
  { name: "Aufbau", bars: 8, level: 0.55, color: "#5fd4d4" },
  { name: "Drop", bars: 32, level: 1, pad: "2", color: "#ffa23e" },
  { name: "Break", bars: 16, level: 0.3, pad: "3", color: "#b48cff" },
  { name: "Drop 2", bars: 32, level: 1, pad: "4", color: "#ffa23e" },
  { name: "Outro", bars: 16, level: 0.35, pad: "6 · 8", color: "#f2617a" },
];

/** Typischer Aufbau eines Club-Tracks in 8-Takt-Phrasen, mit den Pads, die SetTracker darauf legt. */
export function TrackBlueprint() {
  const total = BLUEPRINT.reduce((s, b) => s + b.bars, 0);
  const W = 640, H = 118, base = 86;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Typischer Aufbau eines Tracks">
      {BLUEPRINT.map((sec) => {
        const x0 = (acc / total) * W, w = (sec.bars / total) * W;
        acc += sec.bars;
        const h = sec.level * 56;
        return (
          <g key={sec.name}>
            <rect x={x0 + 1} y={base - h} width={w - 2} height={h} rx={5} fill={sec.color} opacity={0.3} />
            <rect x={x0 + 1} y={base - h} width={w - 2} height={3} rx={1.5} fill={sec.color} />
            {Array.from({ length: sec.bars / 8 - 1 }, (_, i) => <line key={i} x1={x0 + ((i + 1) * 8 / sec.bars) * w} x2={x0 + ((i + 1) * 8 / sec.bars) * w} y1={base - h + 4} y2={base} stroke="var(--bg)" strokeWidth={1.5} />)}
            <text x={x0 + w / 2} y={base + 13} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--text)">{sec.name}</text>
            <text x={x0 + w / 2} y={base + 25} textAnchor="middle" fontSize={8.5} fill="var(--faint)">{sec.bars} Takte</text>
            {sec.pad && <>
              <rect x={x0 + 3} y={6} width={sec.pad.length > 1 ? 36 : 18} height={15} rx={4} fill={sec.color} />
              <text x={x0 + 3 + (sec.pad.length > 1 ? 18 : 9)} y={17} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0a0c10">{sec.pad}</text>
            </>}
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ Auf der Eins oder daneben
const OFFSETS: [number, string, string][] = [
  [0, "Auf der Eins", "Die Phrasengrenzen beider Tracks liegen übereinander: B bringt seinen Hauptteil genau dann, wenn A ins Outro geht."],
  [1, "1 Takt zu spät", "Alles ist um einen Takt verschoben. Die Beats passen, aber B wechselt jedes Mal einen Takt nach A – der Übergang klingt holprig."],
  [-4, "4 Takte zu früh", "B ist eine halbe Phrase voraus: Sein Bass setzt ein, während A noch mitten im Hauptteil steckt – beide spielen gegeneinander."],
];

/** Zwei Tracks übereinander: Was passiert, wenn B nicht auf der Eins einer Phrase startet? */
export function AlignmentDemo() {
  const [choice, setChoice] = useState(0);
  const [offset, , text] = OFFSETS[choice];
  const W = 640, bar = 16, x0 = 70, row = 34;
  const blocksA: [number, number, string, string][] = [[0, 16, "Hauptteil", "#ffa23e"], [16, 8, "Outro", "#f2617a"]];
  const blocksB: [number, number, string, string][] = [[8 + offset, 8, "Intro", "#3ecf8e"], [16 + offset, 16, "Hauptteil", "#ffa23e"]];
  const draw = (blocks: [number, number, string, string][], y: number) => blocks.map(([start, len, name, color]) => (
    <g key={name}>
      <rect x={x0 + start * bar + 1} y={y} width={len * bar - 2} height={row} rx={5} fill={color} opacity={0.3} />
      {Array.from({ length: len / 8 + 1 }, (_, i) => <line key={i} x1={x0 + (start + i * 8) * bar} x2={x0 + (start + i * 8) * bar} y1={y - 3} y2={y + row + 3} stroke={color} strokeWidth={2.5} strokeLinecap="round" />)}
      {Array.from({ length: len }, (_, i) => i % 8 ? <line key={`b${i}`} x1={x0 + (start + i) * bar} x2={x0 + (start + i) * bar} y1={y + row - 6} y2={y + row} stroke="var(--faint)" strokeWidth={1} /> : null)}
      <text x={x0 + (start + len / 2) * bar} y={y + row / 2 + 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--text)">{name}</text>
    </g>
  ));
  const ok = offset === 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {OFFSETS.map(([, label], i) => (
          <button key={label} onClick={() => setChoice(i)} aria-pressed={choice === i}
            className={cx("h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", choice === i ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-hover hover:text-text")}>{label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} 132`} className="block w-full" role="img" aria-label="Phrasen zweier Tracks im Vergleich">
        <text x={0} y={39} fontSize={11} fontWeight={600} fill="var(--text)">Track A</text>
        <text x={0} y={95} fontSize={11} fontWeight={600} fill="var(--text)">Track B</text>
        {draw(blocksA, 18)}
        <g style={{ transition: "transform 0.35s ease" }}>{draw(blocksB, 74)}</g>
        {/* Wechsel von A (Outro beginnt) gegen Wechsel von B (Hauptteil beginnt) */}
        <line x1={x0 + 16 * bar} x2={x0 + 16 * bar} y1={8} y2={122} stroke={ok ? "var(--good)" : "var(--faint)"} strokeWidth={1.5} strokeDasharray="4 3" />
        {!ok && <line x1={x0 + (16 + offset) * bar} x2={x0 + (16 + offset) * bar} y1={62} y2={122} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="4 3" />}
        <text x={x0 + 16 * bar + 5} y={12} fontSize={9} fontWeight={700} fill={ok ? "var(--good)" : "var(--muted)"}>A wechselt</text>
        <text x={x0 + (16 + offset) * bar + 5} y={128} fontSize={9} fontWeight={700} fill={ok ? "var(--good)" : "var(--bad)"}>{ok ? "B wechselt gleichzeitig" : "B wechselt hier"}</text>
      </svg>
      <p className="mt-2 text-[13px]" style={{ color: ok ? "var(--good)" : "var(--bad)" }}>{text}</p>
    </div>
  );
}

// ------------------------------------------------------------------ Tonarten-Rad
const MINOR = ["A♭m", "E♭m", "B♭m", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F♯m", "D♭m"];
const MAJOR = ["B", "F♯", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E"];

function relation(a: [number, string], b: [number, string]): { score: number; label: string } {
  const step = (b[0] - a[0] + 12) % 12;
  const same = a[1] === b[1];
  if (step === 0 && same) return { score: 1, label: "gleiche Tonart" };
  if (step === 0) return { score: 0.9, label: "Dur/Moll-Parallele" };
  if (same && (step === 1 || step === 11)) return { score: 0.9, label: "Nachbartonart" };
  if (!same && (step === 1 || step === 11)) return { score: 0.7, label: "diagonal verwandt" };
  if (same && (step === 2 || step === 7)) return { score: 0.6, label: "Energie-Boost" };
  return { score: 0.15, label: "Tonart-Clash" };
}

/** Das Camelot-Rad zum Anklicken: zeigt, welche Tonarten zur gewählten passen. */
export function CamelotWheel() {
  const [sel, setSel] = useState<[number, string]>([8, "A"]);
  const C = 170;
  const seg = (num: number, r0: number, r1: number) => {
    const a0 = ((num - 1) / 12) * 2 * Math.PI - Math.PI / 2 - Math.PI / 12, a1 = a0 + Math.PI / 6;
    const p = (a: number, r: number) => `${(C + Math.cos(a) * r).toFixed(1)},${(C + Math.sin(a) * r).toFixed(1)}`;
    return `M${p(a0, r0)} L${p(a0, r1)} A${r1},${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0},${r0} 0 0 0 ${p(a0, r0)} Z`;
  };
  const cells = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((num) => (["B", "A"] as const).map((letter) => ({ num, letter })));
  return (
    <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[340px_minmax(0,1fr)]">
      <svg viewBox="0 0 340 340" className="mx-auto block w-full max-w-[340px]" role="img" aria-label="Camelot-Rad">
        {cells.map(({ num, letter }) => {
          const rel = relation(sel, [num, letter]);
          const [r0, r1] = letter === "B" ? [112, 162] : [60, 110];
          const hue = ((num - 1) * 30 + 200) % 360;
          const a = ((num - 1) / 12) * 2 * Math.PI - Math.PI / 2;
          const rm = (r0 + r1) / 2;
          const strong = rel.score >= 0.6;
          const selected = sel[0] === num && sel[1] === letter;
          return (
            <g key={`${num}${letter}`} onClick={() => setSel([num, letter])} style={{ cursor: "pointer" }}>
              <path d={seg(num, r0 + 1.5, r1 - 1.5)} fill={`hsl(${hue} 70% 55%)`} opacity={selected ? 1 : rel.score >= 0.9 ? 0.75 : strong ? 0.45 : 0.1} stroke={selected ? "var(--text)" : "none"} strokeWidth={2.5} />
              <text x={C + Math.cos(a) * rm} y={C + Math.sin(a) * rm - 1} textAnchor="middle" fontSize={12} fontWeight={700} fill={selected || rel.score >= 0.9 ? "#0a0c10" : "var(--text)"} opacity={strong || selected ? 1 : 0.45} style={{ pointerEvents: "none" }}>{num}{letter}</text>
              <text x={C + Math.cos(a) * rm} y={C + Math.sin(a) * rm + 11} textAnchor="middle" fontSize={8.5} fill={selected || rel.score >= 0.9 ? "#0a0c10" : "var(--muted)"} opacity={strong || selected ? 1 : 0.45} style={{ pointerEvents: "none" }}>{(letter === "A" ? MINOR : MAJOR)[num - 1]}</text>
            </g>
          );
        })}
        <text x={C} y={C - 4} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--text)">{sel[0]}{sel[1]}</text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">{(sel[1] === "A" ? MINOR : MAJOR)[sel[0] - 1]}</text>
      </svg>
      <div className="space-y-3 text-[13px] leading-relaxed">
        <p className="text-muted">Jeder Track hat eine Tonart. SetTracker zeigt sie als Camelot-Code: Die Zahl ist die Position auf dem Rad, <b className="font-medium text-text">A</b> steht für Moll (innen), <b className="font-medium text-text">B</b> für Dur (außen). Klick auf ein Feld – kräftig gefärbte Felder passen zu <b className="font-medium text-text">{sel[0]}{sel[1]}</b>.</p>
        {[
          ["Gleiche Tonart", `${sel[0]}${sel[1]}`, "Passt immer. Lange Überblendungen sind kein Problem."],
          ["Nachbarn auf dem Rad", `${(sel[0] + 10) % 12 + 1}${sel[1]} und ${sel[0] % 12 + 1}${sel[1]}`, "Eine Zahl hoch oder runter: klingt harmonisch, +1 hebt die Stimmung leicht."],
          ["Dur/Moll-Parallele", `${sel[0]}${sel[1] === "A" ? "B" : "A"}`, "Gleiche Zahl, anderer Buchstabe: gleiche Töne, andere Stimmung (Moll ↔ Dur)."],
          ["Energie-Boost", `${(sel[0] + 1) % 12 + 1}${sel[1]} und ${(sel[0] + 6) % 12 + 1}${sel[1]}`, "Zwei Zahlen bzw. einen Halbton höher: bewusster Schub, nur kurz überblenden."],
          ["Alles andere", "blass", "Die Tonarten reiben sich. Dann lieber Echo-Out oder Cut statt eines langen Blends."],
        ].map(([title, keys, text]) => (
          <div key={title} className="flex gap-3">
            <span className="num w-24 shrink-0 pt-px font-mono text-xs font-semibold text-accent">{keys}</span>
            <span><b className="font-semibold">{title}.</b> <span className="text-muted">{text}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
