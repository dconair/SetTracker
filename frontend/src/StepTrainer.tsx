import { BookOpen, ChevronLeft, ChevronRight, Lightbulb, MousePointerClick, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBeat } from "./beat";
import { Flx4 } from "./Flx4";
import { MixLanes } from "./LearnVisuals";
import type { Step } from "./types";
import { Button, cx } from "./ui";

type Mode = "read" | "practice" | "run";
const MODES: [Mode, string, React.ReactNode][] = [
  ["read", "Anleitung", <BookOpen size={14} key="r" />],
  ["practice", "Üben", <MousePointerClick size={14} key="p" />],
  ["run", "Ablauf im Takt", <Timer size={14} key="t" />],
];

/**
 * Schritt-für-Schritt-Trainer am Controller-Schema.
 * Anleitung: Schritte lesen, Bedienelemente leuchten. Üben: das richtige Bedienelement anklicken.
 * Ablauf im Takt: ein Übungs-Beat läuft, die Schritte werden zum passenden Takt aktiv.
 */
export function StepTrainer({ steps, bpm, template, bars }: { steps: Step[]; bpm: number; template?: string; bars?: number }) {
  const [mode, setMode] = useState<Mode>("read");
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const [beatIndex, setBeatIndex] = useState(-1);

  const lastBar = useMemo(() => Math.max(1, ...steps.map((s) => s.bar_to ?? 0)), [steps]);
  const beat = useBeat({
    bpm,
    phraseBars: 8,
    onBeat: (i) => {
      setBeatIndex(i);
      if (Math.floor(i / 4) > lastBar) beat.stop();
    },
  });

  const reset = (next: Mode = mode) => {
    beat.stop();
    setMode(next);
    setIndex(0);
    setFound([]);
    setWrong(null);
    setMisses(0);
    setHint(false);
    setFinished(false);
    setBeatIndex(-1);
  };
  useEffect(() => reset("read"), [steps]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Ablauf im Takt: Takt 0 ist das Einzählen
  const bar = beatIndex < 0 ? -1 : Math.floor(beatIndex / 4);
  const running = mode === "run" && beat.playing;
  const activeInRun = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.bar_from !== null && bar >= s.bar_from && bar <= (s.bar_to ?? s.bar_from));
  const runIndex = activeInRun.length ? activeInRun[activeInRun.length - 1].i : -1;

  const active =
    mode === "read" ? step?.controls ?? []
    : mode === "practice" ? (hint ? (step?.controls ?? []).filter((c) => !found.includes(c)) : [])
    : activeInRun.flatMap(({ s }) => s.controls);
  const currentIndex = mode === "run" ? runIndex : index;

  return (
    <div>
      <div className="sticky top-0 z-10 rounded-xl border border-line bg-surface p-3" style={{ boxShadow: "var(--shadow)" }}>
        <div className="mb-2 flex gap-1 rounded-lg bg-bg p-1" role="tablist">
          {MODES.map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={mode === key} onClick={() => reset(key)}
              className={cx("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors", mode === key ? "bg-raised text-text shadow-sm" : "text-muted hover:text-text")}>
              {icon}{label}
            </button>
          ))}
        </div>
        <Flx4 active={active} done={mode === "practice" ? found : []} wrong={wrong} onPick={mode === "practice" && !finished ? pick : undefined} />

        {mode === "read" && (
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" disabled={index === 0} onClick={() => go(index - 1)} icon={<ChevronLeft size={15} />}>Zurück</Button>
            <div className="min-w-0 flex-1 text-center text-[13px]">
              <span className="font-semibold text-accent">Schritt {index + 1}/{steps.length} · {step?.when}</span>
              {step?.controls.length === 0 && <span className="text-faint"> · kein Bedienelement</span>}
            </div>
            <Button size="sm" variant="primary" disabled={index >= steps.length - 1} onClick={() => go(index + 1)}>Weiter <ChevronRight size={15} /></Button>
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
            <div className="flex items-center gap-3">
              <Button size="sm" variant="primary" icon={running ? <Pause size={14} /> : <Play size={14} />} onClick={() => { if (running) beat.stop(); else { setBeatIndex(-1); beat.start(); } }}>
                {running ? "Stopp" : "Start"}
              </Button>
              <div className="min-w-0 flex-1 text-[13px]">
                {bar < 0 ? <span className="text-muted">Ein Übungs-Beat mit {Math.round(bpm)} BPM läuft, die Schritte werden zum richtigen Takt aktiv. Erst ein Takt Einzählen.</span>
                  : bar === 0 ? <span className="font-semibold text-muted">Einzählen …</span>
                  : bar > lastBar ? <span className="font-semibold text-good">Fertig – der Übergang ist durch.</span>
                  : <span className="font-semibold text-accent">Takt {bar} von {lastBar}</span>}
              </div>
              <div className="flex gap-1.5" aria-hidden>
                {[0, 1, 2, 3].map((b) => (
                  <span key={`${b}-${beatIndex}`} className={cx("num flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", beatIndex >= 0 && beatIndex % 4 === b ? "beat-pop bg-accent text-accent-fg" : "bg-hover text-faint")}>{b + 1}</span>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex gap-0.5">
              {Array.from({ length: lastBar }, (_, i) => {
                const hasStep = steps.some((s) => s.bar_from === i + 1);
                return <span key={i} title={`Takt ${i + 1}`} className="h-2 flex-1 rounded-sm" style={{ background: bar === i + 1 ? "var(--accent)" : bar > i + 1 ? "color-mix(in srgb, var(--accent) 40%, var(--line))" : hasStep ? "var(--faint)" : "var(--line)" }} />;
              })}
            </div>
          </div>
        )}
      </div>

      {template && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h4 className="text-[13px] font-semibold">Was die Regler machen</h4>
            <span className="text-xs text-faint">{mode === "run" ? "Der Zeiger läuft im Takt mit" : "Der hinterlegte Bereich gehört zum aktuellen Schritt"}</span>
          </div>
          <MixLanes
            template={template}
            bars={Math.max(bars ?? 0, 1)}
            progress={mode === "run" && beatIndex >= 4 ? (beatIndex - 4) / (Math.max(bars ?? 0, 1) * 4) : null}
            range={mode !== "run" && step?.bar_from ? [step.bar_from, Math.min(step.bar_to ?? step.bar_from, Math.max(bars ?? 0, 1) + 1)] : null}
          />
        </div>
      )}

      <ol className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {steps.map((s, i) => {
          const current = i === currentIndex || (mode === "run" && activeInRun.some((a) => a.i === i));
          const past = mode === "practice" ? i < index || finished : mode === "run" && s.bar_to !== null && bar > s.bar_to;
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
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
