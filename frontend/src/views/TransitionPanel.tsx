import { ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Flx4 } from "../Flx4";
import { useStore } from "../store";
import type { Plan, Track, TransitionDetail, WaveData } from "../types";
import { Button, cx, fmtBpm, IconButton, KeyBadge, ScoreBadge, verdictColor } from "../ui";
import { Waveform, type Marker } from "../Waveform";
import { cueColor } from "./TrackPanel";


/** Seitenleiste mit Übergangsplan: ausgerichtete Waveforms, Marken und FLX4-Schritte. */
export function TransitionPanel({ setId, index, total, onClose, onNavigate }: { setId: number; index: number; total: number; onClose: () => void; onNavigate: (i: number) => void }) {
  const { status } = useStore();
  const [detail, setDetail] = useState<TransitionDetail | null>(null);
  const [waves, setWaves] = useState<{ a: WaveData | null; b: WaveData | null }>({ a: null, b: null });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setDetail(null);
    setStepIndex(0);
    setWaves({ a: null, b: null });
    api.transition(setId, index).then((d) => {
      setDetail(d);
      const get = (t: Track) => (t.has_analysis ? api.waveform(t.id).catch(() => null) : Promise.resolve(null));
      Promise.all([get(d.a), get(d.b)]).then(([a, b]) => setWaves({ a, b }));
    });
  }, [setId, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < total - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, onClose, onNavigate]);

  const choose = (template: string) => api.transition(setId, index, template).then((d) => { setDetail(d); setStepIndex(0); });
  const plan = detail?.plan;

  return (
    <div className="fade fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="slide flex h-full w-full max-w-[880px] flex-col border-l border-line bg-bg" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          <IconButton label="Vorheriger Übergang" disabled={index === 0} onClick={() => onNavigate(index - 1)}><ChevronLeft size={18} /></IconButton>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">Übergang {index + 1} von {total}</div>
            <div className="truncate font-semibold">{detail ? `${detail.a.title} → ${detail.b.title}` : "Lade …"}</div>
          </div>
          {detail && <ScoreBadge score={detail.score.score} verdict={detail.score.verdict} size="lg" />}
          <IconButton label="Nächster Übergang" disabled={index >= total - 1} onClick={() => onNavigate(index + 1)}><ChevronRight size={18} /></IconButton>
          <IconButton label="Schließen" onClick={onClose}><X size={18} /></IconButton>
        </div>

        {!detail || !plan ? (
          <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-20" />)}</div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
              {Object.entries(detail.score.parts).map(([key, part]) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs text-muted">
                    {part.label}
                    <span className="num font-semibold" style={{ color: part.score === null ? "var(--faint)" : verdictColor[part.score >= 0.72 ? "good" : part.score >= 0.5 ? "ok" : "bad"] }}>
                      {part.score === null ? "?" : Math.round(part.score * 100)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    {part.score !== null && <div className="h-full rounded-full" style={{ width: `${part.score * 100}%`, background: verdictColor[part.score >= 0.72 ? "good" : part.score >= 0.5 ? "ok" : "bad"] }} />}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-faint">{part.text}</div>
                </div>
              ))}
            </div>

            <section className="rounded-xl border border-line bg-surface">
              <DeckWave deck={plan.deck_a} track={detail.a} wave={waves.a} plan={plan} side="a" other={waves.b} />
              <div className="border-t border-line" />
              <DeckWave deck={plan.deck_b} track={detail.b} wave={waves.b} plan={plan} side="b" other={waves.a} />
              {plan.precise && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted">
                  <Legend color="var(--wave-low)" label="Bass" /><Legend color="var(--wave-mid)" label="Mitten" /><Legend color="var(--wave-high)" label="Höhen" />
                  <span className="ml-auto">Farbig hinterlegt: Überblend-Bereich ({plan.bars} Takte) · Linien alle 4 Takte</span>
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 text-xs font-medium text-muted">Übergangsart</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(status?.templates ?? {}).map(([key, label]) => (
                  <button key={key} onClick={() => choose(key)} aria-pressed={plan.template === key}
                    className={cx("h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", plan.template === key ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:bg-hover hover:text-text")}>
                    {label}{plan.suggested === key && <span className="ml-1.5 text-[11px] opacity-70">empfohlen</span>}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 flex items-start gap-2 text-[13px] text-muted"><Info size={15} className="mt-0.5 shrink-0 text-accent" />{plan.why}</p>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">Schritt für Schritt am DDJ-FLX4</h3>
                <Button size="sm" variant="ghost" onClick={() => window.open(`/api/sets/${setId}/export/cheatsheet.html`, "_blank")}>Spickzettel öffnen</Button>
              </div>
              <div className="sticky top-0 z-10 rounded-xl border border-line bg-surface p-3" style={{ boxShadow: "var(--shadow)" }}>
                <Flx4 active={plan.steps[stepIndex]?.controls ?? []} />
                <div className="mt-2 flex items-center gap-3">
                  <Button size="sm" disabled={stepIndex === 0} onClick={() => setStepIndex(stepIndex - 1)} icon={<ChevronLeft size={15} />}>Zurück</Button>
                  <div className="min-w-0 flex-1 text-center text-[13px]">
                    <span className="font-semibold text-accent">Schritt {stepIndex + 1}/{plan.steps.length} · {plan.steps[stepIndex]?.when}</span>
                    {plan.steps[stepIndex]?.controls.length === 0 && <span className="text-faint"> · kein Bedienelement</span>}
                  </div>
                  <Button size="sm" variant="primary" disabled={stepIndex >= plan.steps.length - 1} onClick={() => setStepIndex(stepIndex + 1)}>Weiter <ChevronRight size={15} /></Button>
                </div>
              </div>
              <ol className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
                {plan.steps.map((step, i) => (
                  <li key={i}>
                    <button onClick={() => setStepIndex(i)} aria-current={i === stepIndex ? "step" : undefined}
                      className={cx("flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors", i === stepIndex ? "bg-accent-soft" : "hover:bg-hover")}>
                      <span className={cx("num mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", i === stepIndex ? "bg-accent text-accent-fg" : "bg-hover text-muted")}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-0.5 flex items-center gap-2 text-xs">
                          <span className="font-semibold text-accent">{step.when}</span>
                          {step.deck && <span className="rounded bg-hover px-1.5 py-px font-medium text-muted">Deck {step.deck}</span>}
                        </span>
                        <span className="block text-[13px] leading-relaxed">{step.text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}</span>;
}

/** Eine Deck-Zeile: beide Waveforms teilen dieselbe Takt-Achse, der Mix-Punkt liegt bei beiden an derselben Stelle. */
function DeckWave({ deck, track, wave, plan, side, other }: { deck: number; track: Track; wave: WaveData | null; plan: Plan; side: "a" | "b"; other: WaveData | null }) {
  const view = useMemo(() => {
    if (!wave || !wave.bar_len || !plan.mix_out || !plan.mix_in) return null;
    const lead = 8;                              // Takte vor dem Mix-Punkt
    const span = lead + Math.max(plan.bars, 4) + 12;
    const anchor = side === "a" ? plan.mix_out.time : plan.mix_in.time;
    const start = anchor - lead * wave.bar_len;
    const cues = side === "a" ? plan.cues_a : plan.cues_b;
    const markers: Marker[] = cues.map((c) => ({ time: c.time, label: `${c.name} · Pad ${c.pad}`, color: cueColor(c.name) }));
    return { start, end: start + span * wave.bar_len, markers, highlight: { start: anchor, end: anchor + Math.max(plan.bars, 1) * wave.bar_len } };
  }, [wave, plan, side]);

  return (
    <div className="p-4">
      <div className="mb-2.5 flex items-center gap-3">
        <span className="flex h-7 shrink-0 items-center rounded-md bg-accent-soft px-2 text-xs font-semibold text-accent">Deck {deck}</span>
        <div className="min-w-0 flex-1">
          <span className="font-medium">{track.title}</span> <span className="text-muted">– {track.artist || "Unbekannt"}</span>
        </div>
        <span className="num font-mono text-[13px] text-muted">{fmtBpm(track.bpm)} BPM</span>
        <KeyBadge camelot={track.camelot} name={track.key_name} />
      </div>
      {view && wave ? (
        <Waveform data={wave} start={view.start} end={view.end} markers={view.markers} highlight={view.highlight} height={104} showBars />
      ) : track.has_analysis && (!wave || (plan.precise && !other)) ? (
        <div className="skeleton h-[104px]" />
      ) : wave ? (
        <Waveform data={wave} height={72} />
      ) : (
        <div className="flex h-[72px] items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-faint">
          Nur bei Spotify – ohne Audiodatei gibt es keine Waveform und keine taktgenauen Marken.
        </div>
      )}
      {view && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {(side === "a" ? plan.cues_a : plan.cues_b).map((c) => (
            <span key={c.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cueColor(c.name) }} /><b className="font-medium text-text">{c.name}</b><span className="num font-mono">{c.label}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}
