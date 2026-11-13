import { useState } from "react";
import type { Automation, Curve } from "./types";
import { cx } from "./ui";

const A = "var(--wave-low)";
const B = "var(--wave-mid)";

// ------------------------------------------------------------------ Regler-Verlauf eines Übergangs
/** Wert einer Kurve zum Takt `bar` (linear zwischen den Punkten, davor/danach konstant). */
export function valueAt(points: Curve, bar: number): number {
  if (bar <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [b0, v0] = points[i], [b1, v1] = points[i + 1];
    if (bar >= b0 && bar < b1) return v0 + ((v1 - v0) * (bar - b0)) / (b1 - b0);
  }
  return points[points.length - 1][1];
}

/** Alle Reglerstellungen zum Takt `bar` – für die Controller-Animation. */
export function controlValues(auto: Automation, bar: number): Record<string, number> {
  const out: Record<string, number> = { ...auto.rest };
  for (const [id, pts] of Object.entries(auto.controls)) out[id] = valueAt(pts, bar);
  return out;
}

/**
 * Reglerspuren über die Takte des Übergangs. `from`/`to` legen den sichtbaren Taktbereich fest
 * (0 = Beginn des Übergangs) – derselbe Bereich wie bei den Waveforms darüber, damit alles
 * auf einer Achse liegt. `pos` setzt den Zeiger, `range` hebt den Taktbereich eines Schritts hervor.
 */
export function MixLanes({ automation, from = -1, to, pos, range, onSeek }: { automation: Automation; from?: number; to?: number; pos?: number | null; range?: [number, number] | null; onSeek?: (bar: number) => void }) {
  const n = automation.bars;
  const end = to ?? n + 1;
  const W = 640, laneH = 40, gap = 6, top = 18;
  const x = (bar: number) => ((bar - from) / (end - from)) * W;
  const lanes = automation.groups;
  const H = top + lanes.length * (laneH + gap);
  const path = (pts: Curve, y0: number) => {
    const all: Curve = [[from, pts[0][1]], ...pts, [end, pts[pts.length - 1][1]]];
    return all.map(([b, v], i) => `${i ? "L" : "M"}${x(b).toFixed(1)},${(y0 + 5 + (1 - v) * (laneH - 10)).toFixed(1)}`).join(" ");
  };
  const step = end - from > 24 ? 8 : end - from > 10 ? 4 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= end; t += step) ticks.push(t);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={cx("block w-full", onSeek && "cursor-pointer")} role="img" aria-label="Verlauf der Regler über den Übergang"
        onClick={onSeek ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(from + ((e.clientX - r.left) / r.width) * (end - from)); } : undefined}>
        <rect x={x(0)} y={top - 2} width={x(n) - x(0)} height={H - top} fill="var(--accent)" opacity={0.07} />
        {range && <rect x={x(range[0] - 1)} y={top - 2} width={Math.max(3, x(range[1]) - x(range[0] - 1))} height={H - top} rx={3} fill="var(--accent)" opacity={0.16} />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 2} y2={H} stroke="var(--line)" strokeWidth={t % 8 === 0 ? 1.5 : 0.75} />
            {t >= 0 && t <= n && <text x={x(t) + 3} y={11} fontSize={8.5} fill={t % 8 === 0 ? "var(--muted)" : "var(--faint)"} fontWeight={600}>{t === n ? "Ende" : `Takt ${t + 1}`}</text>}
          </g>
        ))}
        {lanes.map((lane, i) => {
          const y0 = top + i * (laneH + gap);
          return (
            <g key={lane.label}>
              <rect x={0} y={y0} width={W} height={laneH} rx={5} fill="var(--raised)" opacity={0.55} stroke="var(--line)" />
              {lane.band && <rect x={x(lane.band[0])} y={y0 + 9} width={x(lane.band[1]) - x(lane.band[0])} height={laneH - 18} rx={5} fill="var(--accent)" opacity={0.35} />}
              {lane.a && <path d={path(lane.a, y0)} fill="none" stroke={A} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
              {lane.b && <path d={path(lane.b, y0)} fill="none" stroke={B} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
              <text x={6} y={y0 + laneH / 2 + 3} fontSize={9.5} fontWeight={700} fill="var(--text)" stroke="var(--surface)" strokeWidth={3.5} paintOrder="stroke">
                {lane.label}<tspan fontSize={7.5} fontWeight={500} fill="var(--muted)"> · {lane.hint}</tspan>
              </text>
              {pos !== null && pos !== undefined && (lane.a || lane.b) && [lane.a ? [lane.a, A] as const : null, lane.b ? [lane.b, B] as const : null].map((entry) => entry && (
                <circle key={entry[1]} cx={x(pos)} cy={y0 + 5 + (1 - valueAt(entry[0], pos)) * (laneH - 10)} r={4} fill={entry[1]} stroke="var(--bg)" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
        {pos !== null && pos !== undefined && pos >= from && pos <= end && <line x1={x(pos)} x2={x(pos)} y1={top - 6} y2={H} stroke="var(--text)" strokeWidth={1.5} />}
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: A }} />Track A (läuft)</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded-full" style={{ background: B }} />Track B (kommt)</span>
        <span className="text-faint">oben = voll auf bzw. rechts · Mitte = 12 Uhr · unten = zu bzw. links</span>
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
