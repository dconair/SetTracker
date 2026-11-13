import { BookOpen, ChevronLeft, ChevronRight, Headphones, Lightbulb, MousePointerClick, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBeat } from "./beat";
import { Flx4 } from "./Flx4";
import { controlValues, MixLanes } from "./LearnVisuals";
import { MixPreview, type PreviewConfig } from "./mixPreview";
import type { Automation, Step } from "./types";
import { Button, cx } from "./ui";

type Mode = "read" | "practice" | "run";
const MODES: [Mode, string, React.ReactNode][] = [
  ["read", "Anleitung", <BookOpen size={14} key="r" />],
  ["practice", "Üben", <MousePointerClick size={14} key="p" />],
  ["run", "Ablauf im Takt", <Timer size={14} key="t" />],
];

/** Taktposition, deren Reglerstellung zu einem Schritt gezeigt wird: der Zustand nach dem Schritt. */
function stepPos(step: Step | undefined): number {
  if (!step || step.bar_from === null) return -0.5;                    // Vorbereitung: Ausgangsstellung
  const to = step.bar_to ?? step.bar_from;
  return to > step.bar_from ? to : step.bar_from - 1 + 0.02;           // Bereich: Endstellung · Sprung: direkt danach
}

interface Props {
  steps: Step[];
  bpm: number;
  automation: Automation;
  /** Mit Audiodateien beider Tracks: hörbare Vorschau statt Übungs-Beat. */
  preview?: PreviewConfig | null;
  /** Sichtbarer Taktbereich der Reglerspuren (Standard: knapp um den Übergang). */
  from?: number;
  to?: number;
  /** Meldet die aktuelle Taktposition (null = kein Zeiger), z. B. für Waveforms außerhalb. */
  onPos?: (bar: number | null) => void;
}

/**
 * Schritt-für-Schritt-Trainer am Controller-Schema. Alle Ansichten lesen dieselbe Regler-Automation:
 * Die Regler im Schema stehen so, wie sie zum gezeigten Takt stehen sollen.
 * Anleitung: Schritte durchgehen. Üben: das richtige Bedienelement anklicken.
 * Ablauf im Takt: Zeiger und Regler laufen mit – mit den eigenen Dateien hörbar, sonst mit Übungs-Beat.
 */
export function StepTrainer({ steps, bpm, automation, preview, from, to, onPos }: Props) {
  const [mode, setMode] = useState<Mode>("read");
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const [runPos, setRunPos] = useState<number | null>(null);
  const [levels, setLevels] = useState<[number, number]>([0, 0]);
  const [audioError, setAudioError] = useState(false);
  const player = useRef<MixPreview | null>(null);

  const n = automation.bars;
  const lastBar = useMemo(() => Math.max(n, ...steps.map((s) => s.bar_to ?? 0)), [steps, n]);
  const beat = useBeat({
    bpm,
    phraseBars: 8,
    onBeat: (i) => {
      setRunPos((i - 4) / 4);                 // ein Takt Einzählen
      if (i / 4 - 1 > lastBar + 1) beat.stop();
    },
  });

  const stopRun = () => { beat.stop(); player.current?.stop(); player.current = null; };
  const reset = (next: Mode = mode) => {
    stopRun();
    setMode(next);
    setIndex(0);
    setFound([]);
    setWrong(null);
    setMisses(0);
    setHint(false);
    setFinished(false);
    setRunPos(null);
  };
  useEffect(() => reset("read"), [steps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopRun, []);            // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps[index];
  const go = (i: number) => { setIndex(i); setFound([]); setWrong(null); setHint(false); };
  const advance = () => (index >= steps.length - 1 ? setFinished(true) : go(index + 1));

  const pick = (id: string) => {
    if (mode !== "practice" || finished || !step) return;
    if (step.controls.includes(id)) {
      if (found.includes(id)) return;
      const all = [...found, id];
      setFound(all);
      setWrong(null);
      if (all.length === step.controls.length) window.setTimeout(advance, 650);
    } else {
      setWrong(id);
      setMisses((m) => m + 1);
      window.setTimeout(() => setWrong((w) => (w === id ? null : w)), 450);
    }
  };

  const running = mode === "run" && (beat.playing || runPos !== null && player.current !== null);
  const startRun = async () => {
    setRunPos(null);
    setAudioError(false);
    if (preview) {
      const p = new MixPreview(preview, automation, (bar) => {
        setRunPos(bar);
        if (bar === null) player.current = null; else setLevels(p.levels());
      });
      player.current = p;
      try { await p.start(); } catch { p.stop(); setAudioError(true); beat.start(); }
    } else beat.start();
  };

  // Welche Taktposition zeigen Regler und Zeiger gerade?
  const pos = mode === "run" ? runPos : mode === "practice" ? stepPos(steps[index - 1]) : stepPos(step);
  useEffect(() => { onPos?.(mode === "run" ? runPos : mode === "read" ? stepPos(step) : null); }, [mode, runPos, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = useMemo(() => controlValues(automation, pos ?? -0.5), [automation, pos]);

  const bar = runPos === null ? null : Math.floor(runPos) + 1;       // Taktnummer (1 = erster Takt des Übergangs)
  const activeInRun = steps.map((s, i) => ({ s, i })).filter(({ s }) => bar !== null && s.bar_from !== null && bar >= s.bar_from && bar <= (s.bar_to ?? s.bar_from));
  const runIndex = activeInRun.length ? activeInRun[activeInRun.length - 1].i : -1;
  const active =
    mode === "read" ? step?.controls ?? []
    : mode === "practice" ? (hint ? (step?.controls ?? []).filter((c) => !found.includes(c)) : [])
    : activeInRun.flatMap(({ s }) => s.controls);
  const currentIndex = mode === "run" ? runIndex : index;
  const beatInBar = runPos === null ? -1 : Math.floor(((runPos % 1) + 1) % 1 * 4);
  const range: [number, number] | null = mode !== "run" && step?.bar_from ? [step.bar_from, Math.min(step.bar_to ?? step.bar_from, n + 1)] : null;

  return (
    <div>
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex gap-1 rounded-lg bg-bg p-1" role="tablist">
          {MODES.map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={mode === key} onClick={() => reset(key)}
              className={cx("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors", mode === key ? "bg-raised text-text shadow-sm" : "text-muted hover:text-text")}>
              {icon}{label}
            </button>
          ))}
        </div>
        <Flx4 active={active} values={values} done={mode === "practice" ? found : []} wrong={wrong} onPick={mode === "practice" && !finished ? pick : undefined} />
        <p className="mt-1 text-center text-[11px] text-faint">Die Regler im Schema stehen so, wie sie {mode === "run" ? "im aktuellen Takt" : "nach diesem Schritt"} stehen sollen. Leuchtende Regler werden gerade bewegt.</p>

        {mode === "read" && (
          <div className="mt-2">
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={index === 0} onClick={() => go(index - 1)} icon={<ChevronLeft size={15} />}>Zurück</Button>
              <div className="min-w-0 flex-1 text-center text-[13px] font-semibold text-accent">Schritt {index + 1}/{steps.length} · {step?.when}</div>
              <Button size="sm" variant="primary" disabled={index >= steps.length - 1} onClick={() => go(index + 1)}>Weiter <ChevronRight size={15} /></Button>
            </div>
            <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed">
              {step?.text}
              {step?.why && <div className="mt-1 text-xs text-muted"><b className="font-semibold text-text">Warum:</b> {step.why}</div>}
            </div>
          </div>
        )}

        {mode === "practice" && (finished ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="flex-1"><b className="font-semibold text-good">Geschafft!</b> {steps.length} Schritte, {misses === 0 ? "kein Fehlgriff" : `${misses} Fehlgriff${misses === 1 ? "" : "e"}`}.</span>
            <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => reset("practice")}>Nochmal</Button>
          </div>
        ) : (
          <div className="mt-2">
            <div className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed">
              <span className="font-semibold text-accent">Schritt {index + 1}/{steps.length} · {step?.when}: </span>{step?.text}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="flex-1">
                {step?.controls.length ? <>Klicke am Controller {step.controls.length === 1 ? "das Bedienelement" : `die ${step.controls.length} Bedienelemente`} an, {step.controls.length === 1 ? "das" : "die"} du jetzt brauchst. <b className="font-medium text-text">{found.length}/{step.controls.length}</b></> : "Für diesen Schritt brauchst du kein Bedienelement – nur zuhören und mitzählen."}
                {misses > 0 && <span className="ml-2 text-bad">{misses} daneben</span>}
              </span>
              {step?.controls.length ? <Button size="sm" variant="ghost" icon={<Lightbulb size={14} />} onClick={() => setHint(true)} disabled={hint}>Tipp zeigen</Button> : null}
              <Button size="sm" variant={step?.controls.length ? "ghost" : "primary"} onClick={advance}>{step?.controls.length ? "Überspringen" : "Weiter"}</Button>
            </div>
          </div>
        ))}

        {mode === "run" && (
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="primary" icon={running ? <Pause size={14} /> : <Play size={14} />} onClick={() => { if (running) { stopRun(); setRunPos(null); } else startRun(); }}>
                {running ? "Stopp" : preview ? "Übergang anhören" : "Start"}
              </Button>
              <div className="min-w-0 flex-1 text-[13px]">
                {runPos === null ? <span className="text-muted">{preview
                  ? <><Headphones size={13} className="mr-1 inline text-accent" />Spielt beide Tracks ab 4 Takte vor dem Mix-Punkt und bewegt EQ, Filter und Fader wie geplant.</>
                  : `Ein Übungs-Beat mit ${Math.round(bpm)} BPM läuft, Regler und Zeiger bewegen sich im Takt. Erst ein Takt Einzählen.`}</span>
                  : runPos < 0 ? <span className="font-semibold text-muted">{preview ? `Noch ${Math.ceil(-runPos)} Takt${Math.ceil(-runPos) === 1 ? "" : "e"} bis zum Mix-Punkt …` : "Einzählen …"}</span>
                  : runPos >= n ? <span className="font-semibold text-good">Übergang durch – Track B läuft allein.</span>
                  : <span className="font-semibold text-accent">Takt {bar} von {n}</span>}
              </div>
              <div className="flex gap-1.5" aria-hidden>
                {[0, 1, 2, 3].map((b) => (
                  <span key={b} className={cx("num flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors", beatInBar === b ? "bg-accent text-accent-fg" : "bg-hover text-faint")}>{b + 1}</span>
                ))}
              </div>
            </div>
            {preview && running && (
              <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-muted" data-testid="levels">
                {(["a", "b"] as const).map((side, i) => (
                  <div key={side} className="flex items-center gap-2">Deck {preview[side].deck}
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full" data-level={levels[i].toFixed(3)} style={{ width: `${levels[i] * 100}%`, background: i === 0 ? "var(--wave-low)" : "var(--wave-mid)" }} /></span>
                  </div>
                ))}
              </div>
            )}
            {audioError && <p className="mt-2 text-xs text-ok">Die Audiodateien ließen sich nicht abspielen – der Ablauf läuft mit Übungs-Beat.</p>}
            {!preview && <p className="mt-2 text-xs text-faint">Hörbar mit den echten Tracks wird der Übergang, sobald beide als Audiodatei in der Bibliothek liegen.</p>}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h4 className="text-[13px] font-semibold">Regler über die Takte</h4>
          <span className="text-xs text-faint">{mode === "run" ? "Der Zeiger läuft mit" : "Hinterlegt: Takte des aktuellen Schritts"}</span>
        </div>
        <MixLanes automation={automation} from={from ?? -1} to={to ?? n + 1} pos={pos} range={range} />
      </div>

      <ol className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {steps.map((s, i) => {
          const current = i === currentIndex || (mode === "run" && activeInRun.some((a) => a.i === i));
          const past = mode === "practice" ? i < index || finished : mode === "run" && bar !== null && s.bar_to !== null && bar > s.bar_to;
          return (
            <li key={i}>
              <button onClick={() => mode === "read" && go(i)} disabled={mode !== "read"} aria-current={current ? "step" : undefined}
                className={cx("flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors disabled:cursor-default", current ? "bg-accent-soft" : mode === "read" && "hover:bg-hover", past && "opacity-55")}>
                <span className={cx("num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", current ? "bg-accent text-accent-fg" : "bg-hover text-muted")}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-accent">{s.when}</span>
                    {s.deck && <span className="rounded bg-hover px-1.5 py-px font-medium text-muted">Deck {s.deck}</span>}
                  </span>
                  <span className="block text-[13px] leading-relaxed">{mode === "practice" && i > index && !finished ? <span className="text-faint">Kommt gleich …</span> : s.text}</span>
                  {s.why && !(mode === "practice" && i > index && !finished) && <span className="mt-0.5 block text-xs text-muted">{s.why}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
