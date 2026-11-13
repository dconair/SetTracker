import { BookOpen, ChevronLeft, ChevronRight, Clapperboard, Headphones, Lightbulb, MousePointerClick, Pause, Play, RotateCcw, SkipBack, SkipForward, Timer, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBeat } from "./beat";
import { Flx4 } from "./Flx4";
import { controlValues, MixLanes } from "./LearnVisuals";
import { MixPreview, type PreviewConfig } from "./mixPreview";
import { scenesFromSteps, sceneState, SPEEDS, usePlayer } from "./tutorial";
import type { Automation, Step } from "./types";
import { Button, cx } from "./ui";

type Mode = "tutorial" | "run" | "practice" | "read";
const MODES: [Mode, string, React.ReactNode][] = [
  ["tutorial", "Tutorial", <Clapperboard size={14} key="v" />],
  ["run", "Im Takt", <Timer size={14} key="t" />],
  ["practice", "Selbst probieren", <MousePointerClick size={14} key="p" />],
  ["read", "Nachlesen", <BookOpen size={14} key="r" />],
];
const CHAPTERS = ["Vorbereitung", "Einstieg", "Überblenden", "Abschluss"];
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith("de"));

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
  const [mode, setMode] = useState<Mode>("tutorial");
  const [speak, setSpeak] = useState(false);
  const [voice, setVoice] = useState(false);
  const scenes = useMemo(() => scenesFromSteps(steps, automation), [steps, automation]);
  const tut = usePlayer(scenes);
  const tutNow = useMemo(() => sceneState(tut.scene, tut.t, automation), [tut.scene, tut.t, automation]);
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
  const [half, setHalf] = useState(false);
  const beat = useBeat({
    bpm: half ? bpm / 2 : bpm,
    phraseBars: 8,
    onBeat: (i) => {
      setRunPos((i - 4) / 4);                 // ein Takt Einzählen
      if (i / 4 - 1 > lastBar + 1) beat.stop();
    },
  });

  const stopRun = () => { beat.stop(); player.current?.stop(); player.current = null; tut.pause(); window.speechSynthesis?.cancel(); };

  // Deutsche Stimme vorhanden? (Die Liste lädt in manchen Browsern erst nachträglich.)
  useEffect(() => {
    const check = () => setVoice(canSpeak());
    check();
    window.speechSynthesis?.addEventListener?.("voiceschanged", check);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", check);
  }, []);
  // Vorlesen: Text der Szene sprechen, sobald sie beginnt
  useEffect(() => {
    if (mode !== "tutorial" || !speak || !tut.playing || !tut.scene) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tut.scene.text);
    u.lang = "de-DE";
    u.rate = Math.min(1.25, 0.95 * tut.speed);
    window.speechSynthesis.speak(u);
  }, [mode, speak, tut.playing, tut.index]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leertaste: Tutorial anhalten/fortsetzen
  useEffect(() => {
    if (mode !== "tutorial") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
      tut.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Beim Start das Tutorial ins Bild holen – der Controller soll ganz zu sehen sein
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "tutorial" || !tut.playing) return;
    const r = card.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) card.current?.scrollIntoView({ block: r.height > window.innerHeight ? "start" : "center", behavior: "smooth" });
  }, [mode, tut.playing]);
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
  useEffect(() => reset("tutorial"), [steps]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const pos = mode === "tutorial" ? tutNow.pos : mode === "run" ? runPos : mode === "practice" ? stepPos(steps[index - 1]) : stepPos(step);
  const shownPos = mode === "tutorial" ? (tutNow.pos >= -0.4 ? tutNow.pos : null) : mode === "run" ? runPos : mode === "read" ? stepPos(step) : null;
  useEffect(() => { onPos?.(shownPos); }, [shownPos]); // eslint-disable-line react-hooks/exhaustive-deps
  const plain = useMemo(() => controlValues(automation, pos ?? -0.5), [automation, pos]);
  const values = mode === "tutorial" ? tutNow.values : plain;

  const bar = runPos === null ? null : Math.floor(runPos) + 1;       // Taktnummer (1 = erster Takt des Übergangs)
  const activeInRun = steps.map((s, i) => ({ s, i })).filter(({ s }) => bar !== null && s.bar_from !== null && bar >= s.bar_from && bar <= (s.bar_to ?? s.bar_from));
  const runIndex = activeInRun.length ? activeInRun[activeInRun.length - 1].i : -1;
  const active =
    mode === "tutorial" ? tut.scene?.focus ?? []
    : mode === "read" ? step?.controls ?? []
    : mode === "practice" ? (hint ? (step?.controls ?? []).filter((c) => !found.includes(c)) : [])
    : activeInRun.flatMap(({ s }) => s.controls);
  const currentIndex = mode === "tutorial" ? tut.scene?.stepIndex ?? -1 : mode === "run" ? runIndex : index;
  const beatInBar = runPos === null ? -1 : Math.floor(((runPos % 1) + 1) % 1 * 4);
  const rangeStep = mode === "tutorial" ? steps[tut.scene?.stepIndex ?? -1] : mode !== "run" ? step : undefined;
  const range: [number, number] | null = rangeStep?.bar_from ? [rangeStep.bar_from, Math.min(rangeStep.bar_to ?? rangeStep.bar_from, n + 1)] : null;

  return (
    <div>
      <div ref={card} className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex gap-1 rounded-lg bg-bg p-1" role="tablist">
          {MODES.map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={mode === key} onClick={() => reset(key)}
              className={cx("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors", mode === key ? "bg-raised text-text shadow-sm" : "text-muted hover:text-text")}>
              {icon}{label}
            </button>
          ))}
        </div>
        <Flx4 active={active} values={values} done={mode === "practice" ? found : []} wrong={wrong} onPick={mode === "practice" && !finished ? pick : undefined}
          focus={mode === "tutorial" && (tut.playing || tut.index > 0 || tut.finished) ? tut.scene?.focus : undefined}
          motion={mode === "tutorial" && tut.phase !== "outro" ? tut.scene?.motion : undefined} />
        {mode !== "tutorial" && <p className="mt-1 text-center text-[11px] text-faint">Die Regler im Schema stehen so, wie sie {mode === "run" ? "im aktuellen Takt" : "nach diesem Schritt"} stehen sollen. Leuchtende Regler werden gerade bewegt.</p>}

        {mode === "tutorial" && (
          <div className="mt-3" data-testid="tutorial">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
              {CHAPTERS.map((c, i) => (
                <span key={c} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-faint">›</span>}
                  <span className={tut.scene?.chapter === c ? "text-accent" : "text-faint"}>{c}</span>
                </span>
              ))}
            </div>
            <div key={tut.index} className="caption-in min-h-[92px] rounded-xl bg-accent-soft px-4 py-3">
              <div className="text-xs font-semibold text-accent" data-testid="scene-title">Schritt {tut.index + 1} von {scenes.length} · {tut.scene?.title}</div>
              <div className="mt-1 text-[15px] leading-relaxed" data-testid="scene-text">{tut.scene?.text}</div>
              {tut.scene?.why && <div className={cx("mt-1.5 text-[13px] text-muted transition-opacity duration-500", tut.phase === "outro" || !tut.playing ? "opacity-100" : "opacity-0")}><b className="font-semibold text-text">Warum:</b> {tut.scene.why}</div>}
            </div>
            <div className="mt-2 flex gap-0.5" role="group" aria-label="Schritte">
              {scenes.map((sc, i) => (
                <button key={i} onClick={() => tut.go(i, tut.playing)} title={`${i + 1}. ${sc.title}`} className="group h-3 flex-1 py-1">
                  <span className="block h-1 overflow-hidden rounded-full bg-line group-hover:bg-faint">
                    <span className="block h-full rounded-full bg-accent" style={{ width: i < tut.index || tut.finished ? "100%" : i === tut.index ? `${tut.progress * 100}%` : "0%" }} />
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" className="min-w-36" icon={tut.playing ? <Pause size={14} /> : tut.finished ? <RotateCcw size={14} /> : <Play size={14} />} onClick={tut.toggle}>
                {tut.playing ? "Pause" : tut.finished ? "Nochmal ansehen" : tut.index === 0 && tut.progress === 0 ? "Tutorial abspielen" : "Weiter abspielen"}
              </Button>
              <Button size="sm" variant="ghost" disabled={tut.index === 0} onClick={() => tut.go(tut.index - 1, tut.playing)} icon={<SkipBack size={14} />} aria-label="Einen Schritt zurück" />
              <Button size="sm" variant="ghost" disabled={tut.index >= scenes.length - 1} onClick={() => tut.go(tut.index + 1, tut.playing)} icon={<SkipForward size={14} />} aria-label="Einen Schritt weiter" />
              <span className="ml-auto flex items-center gap-1 rounded-lg bg-bg p-0.5" role="group" aria-label="Tempo">
                {SPEEDS.map(([v, label]) => (
                  <button key={v} onClick={() => tut.setSpeed(v)} aria-pressed={tut.speed === v} className={cx("h-6 rounded-md px-2 text-[11px] font-medium", tut.speed === v ? "bg-raised text-text shadow-sm" : "text-muted hover:text-text")}>{label}</button>
                ))}
              </span>
              {voice && (
                <button onClick={() => { if (speak) window.speechSynthesis.cancel(); setSpeak(!speak); }} aria-pressed={speak} title="Schritt-Texte vorlesen"
                  className={cx("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium", speak ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-text")}>
                  <Volume2 size={13} />Vorlesen
                </button>
              )}
            </div>
            {tut.finished && (
              <div className="fade mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
                <span className="flex-1">Das war der ganze Übergang. Jetzt selbst versuchen?</span>
                <Button size="sm" icon={<MousePointerClick size={14} />} onClick={() => reset("practice")}>Selbst probieren</Button>
                <Button size="sm" icon={<Timer size={14} />} onClick={() => reset("run")}>{preview ? "Anhören im Takt" : "Im Takt ablaufen lassen"}</Button>
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-faint">Läuft von selbst: erst die Ansage, dann die Bewegung, dann der Grund. Leertaste = Pause. Pfeile zeigen die Richtung, die Beschriftung Start- und Zielstellung.</p>
          </div>
        )}

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
              {!preview && <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={half} disabled={running} onChange={(e) => setHalf(e.target.checked)} className="accent-(--accent)" />Halbes Tempo</label>}
              <div className="min-w-0 flex-1 text-[13px]">
                {runPos === null ? <span className="text-muted">{preview
                  ? <><Headphones size={13} className="mr-1 inline text-accent" />Spielt beide Tracks ab 4 Takte vor dem Mix-Punkt und bewegt EQ, Filter und Fader wie geplant.</>
                  : `Ein Übungs-Beat mit ${Math.round(half ? bpm / 2 : bpm)} BPM läuft, Regler und Zeiger bewegen sich im Takt. Erst ein Takt Einzählen.`}</span>
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
          <span className="text-xs text-faint">{mode === "run" || mode === "tutorial" ? "Der Zeiger läuft mit" : "Hinterlegt: Takte des aktuellen Schritts"}</span>
        </div>
        <MixLanes automation={automation} from={from ?? -1} to={to ?? n + 1} pos={pos} range={range} />
      </div>

      <ol className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
        {steps.map((s, i) => {
          const current = i === currentIndex || (mode === "run" && activeInRun.some((a) => a.i === i));
          const past = mode === "practice" ? i < index || finished : mode === "run" && bar !== null && s.bar_to !== null && bar > s.bar_to;
          return (
            <li key={i}>
              <button onClick={() => (mode === "read" ? go(i) : mode === "tutorial" ? tut.go(scenes.findIndex((sc) => sc.stepIndex === i), tut.playing) : undefined)} disabled={mode !== "read" && mode !== "tutorial"} aria-current={current ? "step" : undefined}
                className={cx("flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors disabled:cursor-default", current ? "bg-accent-soft" : (mode === "read" || mode === "tutorial") && "hover:bg-hover", past && "opacity-55")}>
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
