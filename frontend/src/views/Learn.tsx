import { CircleDot, Disc3, Gauge, GraduationCap, Hand, Lightbulb, Pause, Play, Shuffle, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useBeat } from "../beat";
import { Flx4 } from "../Flx4";
import { AlignmentDemo, CamelotWheel, PhraseClock, TrackBlueprint } from "../LearnVisuals";
import { StepTrainer } from "../StepTrainer";
import { useStore } from "../store";
import type { Lesson, TrackDetail, WaveData } from "../types";
import { Waveform } from "../Waveform";
import { Button, Card, cx, fmtBpm, inputClass, PageHeader, useAction } from "../ui";

type Tab = "count" | "transitions" | "keys" | "controller" | "tips";
const TABS: [Tab, string, React.ReactNode][] = [
  ["count", "Takte & Phrasen zählen", <Gauge size={15} key="c" />],
  ["transitions", "Übergänge", <Shuffle size={15} key="t" />],
  ["keys", "Tonarten", <Disc3 size={15} key="w" />],
  ["controller", "Controller", <SlidersHorizontal size={15} key="k" />],
  ["tips", "Tipps", <Lightbulb size={15} key="l" />],
];

export function Learn() {
  const [tab, setTab] = useState<Tab>("count");
  return (
    <div>
      <PageHeader title="Lernen" subtitle="Zählen üben, Übergänge verstehen und den DDJ-FLX4 kennenlernen – alles ohne angeschlossenen Controller." />
      <div className="flex gap-1.5 overflow-x-auto px-8 pb-5" role="tablist">
        {TABS.map(([key, label, icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cx("inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors", tab === key ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:bg-hover hover:text-text")}>
            {icon}{label}
          </button>
        ))}
      </div>
      <div className="px-8 pb-12">
        {tab === "count" && <Counting />}
        {tab === "transitions" && <Transitions />}
        {tab === "keys" && <Card className="p-6"><CamelotWheel /></Card>}
        {tab === "controller" && <Controller />}
        {tab === "tips" && <Tips />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Zählen
const PHRASE_BARS = 8;

/** Abspiel-Uhr für einen echten Track: zählt Schläge über das erkannte Beatgrid der Datei. */
function useTrackClock(detail: TrackDetail | null, onBeat: (i: number) => void) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const last = useRef(-999);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const beatLen = detail?.analysis ? detail.analysis.bar_len / 4 : 0.5;
  const first = detail?.analysis?.first_downbeat ?? 0;
  const position = useCallback(() => ((audio.current?.currentTime ?? 0) - first) / beatLen, [first, beatLen]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    audio.current?.pause();
    setPlaying(false);
  }, []);
  const start = useCallback((from?: number) => {
    if (!detail) return;
    if (!audio.current || !audio.current.src.endsWith(`/api/tracks/${detail.id}/audio`)) {
      audio.current?.pause();
      audio.current = new Audio(`/api/tracks/${detail.id}/audio`);
      audio.current.addEventListener("ended", () => setPlaying(false));
    }
    if (from !== undefined) audio.current.currentTime = Math.max(0, from);
    audio.current.play().catch(() => setPlaying(false));
    setPlaying(true);
    last.current = -999;
    const tick = () => {
      const el = audio.current;
      if (!el || el.paused) return;
      setTime(el.currentTime);
      const i = Math.floor((el.currentTime - first) / beatLen);
      if (i !== last.current) { last.current = i; onBeat(i); }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [detail, first, beatLen, onBeat]);
  useEffect(() => stop, [stop, detail?.id]);
  return { playing, start, stop, position, time };
}

function Counting() {
  const { tracks, sets } = useStore();
  const run = useAction();
  const [bpm, setBpm] = useState(124);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [showCount, setShowCount] = useState(true);
  const [signal, setSignal] = useState(true);
  const [taps, setTaps] = useState<{ off: number; id: number; at?: string }[]>([]);
  const [trackId, setTrackId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [wave, setWave] = useState<WaveData | null>(null);
  const demo = useBeat({ bpm, phraseBars: PHRASE_BARS, phraseSignal: signal, onBeat: setBeatIndex });
  const real = useTrackClock(detail, setBeatIndex);
  const useTrack = trackId !== null && detail !== null;
  const beat = useTrack ? real : demo;
  const phraseBeats = PHRASE_BARS * 4;

  // Nur lokale, fertig analysierte Dateien lassen sich abspielen und zählen
  const playable = useMemo(() => (tracks ?? []).filter((t) => t.path && t.has_analysis), [tracks]);
  const shown = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return playable.filter((t) => words.every((w) => `${t.title} ${t.artist}`.toLowerCase().includes(w))).slice(0, 200);
  }, [playable, filter]);
  useEffect(() => {
    demo.stop();
    setBeatIndex(-1);
    setTaps([]);
    setDetail(null);
    setWave(null);
    if (trackId === null) return;
    api.track(trackId).then(setDetail).catch(() => setTrackId(null));
    api.waveform(trackId).then(setWave).catch(() => {});
  }, [trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = () => {
    if (!beat.playing) return;
    const pos = beat.position();
    const nearest = Math.round(pos / phraseBeats) * phraseBeats;
    // Beginnt an dieser Phrasengrenze ein Abschnitt des Tracks (Drop, Break …)? Dann beim Namen nennen.
    const section = useTrack ? detail!.analysis?.sections.find((sec) => sec.start_bar * 4 === nearest) : undefined;
    setTaps((t) => [{ off: pos - nearest, id: Date.now(), at: section?.label }, ...t].slice(0, 6));
  };
  useEffect(() => {
    // Die Leertaste gehört hier allein der Übung: Sie darf nicht nebenbei einen fokussierten
    // Knopf (z. B. Start/Stopp) auslösen – das passiert beim Loslassen der Taste.
    const isSpace = (e: KeyboardEvent) => e.code === "Space" && !(e.target instanceof HTMLInputElement);
    const onDown = (e: KeyboardEvent) => { if (isSpace(e)) { e.preventDefault(); if (!e.repeat) tap(); } };
    const onUp = (e: KeyboardEvent) => { if (isSpace(e)) e.preventDefault(); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  });

  const toggle = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    if (beat.playing) { beat.stop(); if (!useTrack) setBeatIndex(-1); } else { setTaps([]); beat.start(); }
  };
  const jumpBefore = (sectionStart: number) => {
    if (!detail?.analysis) return;
    setTaps([]);
    real.start(sectionStart - 8 * detail.analysis.bar_len);   // 8 Takte Anlauf: eine Phrase mitzählen, dann kommt der Wechsel
  };
  const shiftGrid = async (beats: 1 | -1) => {
    if (!detail) return;
    const next = await run(() => api.gridShift(detail.id, beats), "Raster verschoben");
    if (next) { setDetail({ ...detail, analysis: next.analysis }); api.waveform(detail.id).then(setWave).catch(() => {}); }
  };
  const beatInBar = beatIndex < 0 ? -1 : beatIndex % 4;
  const barInPhrase = beatIndex < 0 ? -1 : Math.floor(beatIndex / 4) % PHRASE_BARS;
  const phrase = beatIndex < 0 ? 0 : Math.floor(beatIndex / phraseBeats) + 1;
  const verdict = (off: number) => {
    const a = Math.abs(off);
    if (a <= 0.35) return { text: "Genau auf der Eins", color: "var(--good)" };
    const dir = off < 0 ? "zu früh" : "zu spät";
    if (a <= 1.2) return { text: `Knapp – ${a < 0.75 ? "einen halben" : "einen"} Schlag ${dir}`, color: "var(--ok)" };
    const bars = Math.round(a / 4);
    return { text: bars >= 1 ? `${bars} Takt${bars === 1 ? "" : "e"} ${dir}` : `${Math.round(a)} Schläge ${dir}`, color: "var(--bad)" };
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-line pb-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Womit üben?</div>
              {playable.length === 0 ? (
                <p className="text-[13px] text-muted">Zum Zählen mit echten Tracks braucht SetTracker die Audiodatei: Füge in der Bibliothek einen Musikordner hinzu. Reine Spotify-Tracks lassen sich hier nicht abspielen. Bis dahin läuft der Übungs-Beat.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Track suchen …" className={cx(inputClass, "w-44")} aria-label="Track suchen" />
                  <select value={trackId ?? ""} onChange={(e) => setTrackId(e.target.value ? Number(e.target.value) : null)} className={cx(inputClass, "min-w-0 max-w-full flex-1 cursor-pointer")} aria-label="Track zum Üben">
                    <option value="">Übungs-Beat (ohne Track)</option>
                    {shown.map((t) => <option key={t.id} value={t.id}>{t.artist ? `${t.artist} – ` : ""}{t.title} · {fmtBpm(t.bpm)} BPM</option>)}
                  </select>
                </div>
              )}
            </div>
            {sets.length > 0 && playable.length > 0 && <span className="text-xs text-faint">{playable.length} Tracks mit Audiodatei verfügbar</span>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" icon={beat.playing ? <Pause size={16} /> : <Play size={16} />} onClick={toggle} disabled={trackId !== null && !detail}>{beat.playing ? "Stopp" : useTrack ? "Track abspielen" : "Übungs-Beat starten"}</Button>
            {useTrack ? (
              <span className="text-[13px] text-muted">Tempo des Tracks: <b className="num font-mono font-medium text-text">{fmtBpm(detail!.bpm)} BPM</b></span>
            ) : (
              <label className="flex items-center gap-3 text-[13px] text-muted">
                Tempo
                <input type="range" min={90} max={176} step={1} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-36 accent-(--accent)" aria-label="Tempo in BPM" />
                <span className="num w-16 font-mono text-text">{bpm} BPM</span>
              </label>
            )}
            <Check checked={showCount} onChange={setShowCount}>Zähler anzeigen</Check>
            {!useTrack && <Check checked={signal} onChange={setSignal}>Becken zum Phrasenbeginn</Check>}
          </div>
          {useTrack && wave && detail?.analysis && (
            <div className="mt-4">
              <div className="cursor-pointer" title="Klicken zum Springen" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); real.start(((e.clientX - r.left) / r.width) * wave.duration); }}>
                <Waveform data={wave} height={84} cursor={real.time} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">8 Takte vor …</span>
                {detail.analysis.sections.filter((sec) => sec.start_bar >= 8).map((sec) => (
                  <button key={sec.start} onClick={() => jumpBefore(sec.start)} className="h-7 rounded-full border border-line px-2.5 font-medium text-muted hover:bg-hover hover:text-text">{sec.label} (Takt {sec.start_bar + 1})</button>
                ))}
                <span className="ml-auto flex items-center gap-1.5 text-faint">Eins liegt daneben?
                  <button onClick={() => shiftGrid(-1)} className="h-7 rounded-md border border-line px-2 hover:bg-hover hover:text-text" title="Raster einen Schlag früher">◀ Schlag</button>
                  <button onClick={() => shiftGrid(1)} className="h-7 rounded-md border border-line px-2 hover:bg-hover hover:text-text" title="Raster einen Schlag später">Schlag ▶</button>
                </span>
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <div className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Schläge im Takt</div>
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((b) => (
                <div key={`${b}-${beatIndex}`} className={cx("num flex h-16 flex-1 items-center justify-center rounded-xl border text-2xl font-bold transition-colors",
                  showCount && beatInBar === b ? cx("beat-pop border-accent text-accent-fg", b === 0 ? "bg-accent" : "bg-accent/70") : "border-line bg-raised text-faint")}>
                  {showCount ? b + 1 : "·"}
                </div>
              ))}
            </div>
            <div className="mt-5 mb-2 flex items-center justify-between text-xs font-medium tracking-wide text-muted uppercase">
              <span>Takte in der Phrase</span>
              {showCount && phrase > 0 && <span className="num normal-case">Phrase {phrase}</span>}
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: PHRASE_BARS }, (_, i) => (
                <div key={i} className={cx("num flex h-10 flex-1 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                  showCount && barInPhrase === i ? "border-accent bg-accent-soft text-accent" : showCount && barInPhrase > i ? "border-line bg-hover text-muted" : "border-line bg-raised text-faint")}>
                  {showCount ? i + 1 : "·"}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-faint">4 Schläge = 1 Takt · 8 Takte = 1 Phrase (32 Schläge). {useTrack ? "Gezählt wird ab der erkannten ersten Eins des Tracks; stimmt die Betonung nicht, verschiebe das Raster um einen Schlag." : "Der Basston des Übungs-Beats wechselt mit jeder Phrase."}</p>
          </div>
          <div className="flex justify-center"><PhraseClock beatIndex={beatIndex} bars={PHRASE_BARS} hidden={!showCount} /></div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold"><Hand size={17} className="text-accent" /> Übung: Triff die Eins der neuen Phrase</div>
              <p className="mt-1 text-[13px] text-muted">Zähl mit und drück die <b className="font-medium text-text">Leertaste</b> (oder den Knopf) genau dann, wenn eine neue Phrase beginnt – der Moment, in dem du am Controller PLAY drücken würdest.</p>
            </div>
            <Button onClick={tap} disabled={!beat.playing} icon={<CircleDot size={16} />} className="h-12 px-6">Jetzt!</Button>
          </div>
          {taps.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {taps.map((t, i) => {
                const v = verdict(t.off);
                return (
                  <li key={t.id} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-[13px]", i === 0 ? "bg-hover" : "opacity-60")}>
                    <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                    <span className="flex-1 font-medium" style={{ color: i === 0 ? v.color : undefined }}>{v.text}{t.at && Math.abs(t.off) <= 1.2 ? ` – hier beginnt: ${t.at}` : ""}</span>
                    <span className="num font-mono text-xs text-muted">{t.off >= 0 ? "+" : ""}{t.off.toFixed(1)} Schläge</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
            {[["Stufe 1", "Zähler und Becken an: mitlesen und laut mitzählen."], ["Stufe 2", "Zähler aus, Becken an: nur noch nach Gehör."], ["Stufe 3", "Beides aus: selbst zählen, nur der Basswechsel verrät die Phrase."]].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-line px-3 py-2"><b className="block font-semibold">{t}</b><span className="text-muted">{d}</span></div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Warum die Eins zählt</h2>
          <p className="mt-1 mb-4 text-[13px] text-muted">Track A geht ins Outro, Track B soll übernehmen. Schau, was passiert, wenn B nicht auf der Eins einer Phrase gestartet wird. Dicke Striche sind Phrasengrenzen (alle 8 Takte).</p>
          <AlignmentDemo />
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Bauplan eines Tracks</h2>
          <p className="mt-1 mb-4 text-[13px] text-muted">So sind die meisten Club-Tracks aufgebaut: Blöcke aus 8-Takt-Phrasen, je höher der Block, desto mehr Energie. Die Nummern zeigen, welche Pads SetTracker auf diese Stellen legt.</p>
          <TrackBlueprint />
          <p className="mt-3 text-xs text-faint">Intro und Outro sind zum Mischen da: wenig Melodie, viel Schlagzeug. Echte Tracks weichen ab – in den Track-Details siehst du den erkannten Aufbau jedes eigenen Tracks.</p>
        </Card>
      </div>

      <Card className="h-fit space-y-4 p-5 text-[13px] leading-relaxed xl:row-span-2">
        <h2 className="text-base font-semibold">So zählst du</h2>
        <Para title="Schläge und Takte">Fast alle Clubmusik läuft im 4/4-Takt: Die Kick schlägt viermal pro Takt. Zähl jeden Schlag mit – „1, 2, 3, 4“ – und betone die Eins.</Para>
        <Para title="Takte hochzählen">Damit du nicht den Überblick verlierst, ersetzt die Taktnummer die Eins: „<b className="font-medium">1</b>-2-3-4, <b className="font-medium">2</b>-2-3-4, <b className="font-medium">3</b>-2-3-4 …“ bis „<b className="font-medium">8</b>-2-3-4“. Danach beginnt die nächste Phrase wieder bei 1.</Para>
        <Para title="Phrasen">Tracks sind in Blöcken gebaut, meist 8 Takte (32 Schläge), oft zu 16 oder 32 Takten zusammengefasst. An den Grenzen passiert etwas: ein Becken, ein Wirbel, der Bass setzt ein oder aus, eine neue Melodie.</Para>
        <Para title="Warum das fürs Mixen zählt">Startest du Track B genau auf der Eins einer neuen Phrase von Track A, fallen die Wechsel beider Tracks zusammen: B bringt seinen Bass genau dann, wenn A ihn abgibt. Liegst du einen Takt daneben, klingt der Übergang verschoben, auch wenn die Beats sauber übereinander liegen.</Para>
        <Para title="Am Controller">Im Set zeigt SetTracker die Phrasen als beschriftete Abschnitte und legt Hot Cues darauf. Die Waveform in rekordbox hilft – verlass dich aber aufs Zählen, dann klappt es auch mit Tracks ohne Analyse.</Para>
      </Card>
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-(--accent)" />{children}
    </label>
  );
}

function Para({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="mb-0.5 font-semibold">{title}</div><div className="text-muted">{children}</div></div>;
}

// ------------------------------------------------------------------ Übergänge
const LEVEL = ["", "Einsteiger", "Fortgeschritten", "Anspruchsvoll"];

function Transitions() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.lessons().then((l) => { setLessons(l); setOpen(l[0]?.key ?? null); }).catch(() => setLessons([])); }, []);
  const lesson = lessons?.find((l) => l.key === open);

  if (!lessons) return <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-20" />)}</div>;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2">
        {lessons.map((l) => (
          <button key={l.key} onClick={() => setOpen(l.key)} aria-pressed={open === l.key}
            className={cx("w-full rounded-xl border p-3.5 text-left transition-colors", open === l.key ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover")}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{l.title}</span>
              <span className="flex gap-0.5" title={LEVEL[l.difficulty]}>{[1, 2, 3].map((n) => <span key={n} className="h-1.5 w-3 rounded-full" style={{ background: n <= l.difficulty ? "var(--accent)" : "var(--line)" }} />)}</span>
            </div>
            <div className="mt-1 text-[13px] text-muted">{l.summary}</div>
          </button>
        ))}
        <p className="px-1 pt-2 text-xs text-faint">Welche Art zu zwei konkreten Tracks passt, schlägt SetTracker im Set bei jedem Übergang vor – dort mit echten Zeitmarken.</p>
      </div>
      {lesson && (
        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-semibold">{lesson.title}</h2>
              <span className="text-[13px] text-muted">{LEVEL[lesson.difficulty]}{lesson.bars > 0 && ` · ca. ${lesson.bars} Takte`}</span>
            </div>
            <p className="mt-2 text-muted">{lesson.summary}</p>
            <div className="mt-4 grid grid-cols-1 gap-4 text-[13px] md:grid-cols-3">
              <Para title="Wann einsetzen">{lesson.when}</Para>
              <Para title="Worauf hören">{lesson.listen}</Para>
              <div><div className="mb-0.5 font-semibold">Typische Fehler</div><ul className="list-disc space-y-0.5 pl-4 text-muted">{lesson.mistakes.map((m) => <li key={m}>{m}</li>)}</ul></div>
            </div>
          </Card>
          <StepTrainer key={lesson.key} steps={lesson.steps} bpm={lesson.bpm} automation={lesson.automation} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Controller
const CONTROLS: { ids: string[]; name: string; text: string }[] = [
  { ids: ["play_1", "play_2"], name: "PLAY/PAUSE", text: "Startet und stoppt das Deck. Beim Mixen drückst du PLAY genau auf die Eins einer Phrase." },
  { ids: ["cue_1", "cue_2"], name: "CUE", text: "Im Stopp: setzt den Startpunkt. Gedrückt halten spielt ab dem Punkt, loslassen springt zurück – ideal, um den Einstieg vorzuhören und einzuüben." },
  { ids: ["jog_1", "jog_2"], name: "Jogwheel", text: "Oberseite: scratchen bzw. im Stopp die Position suchen. Rand: das Deck kurz anschieben oder bremsen, wenn die Beats leicht auseinanderlaufen." },
  { ids: ["tempo_1", "tempo_2"], name: "TEMPO-Slider", text: "Ändert das Tempo des Decks (Standard ±6 %). Nach unten wird es schneller. Mit SHIFT + BEAT SYNC lässt sich der Bereich erweitern." },
  { ids: ["sync_1", "sync_2"], name: "BEAT SYNC", text: "Gleicht Tempo und Taktraster automatisch an das andere Deck an. Praktisch am Anfang – verlangt aber ein korrektes Beatgrid in rekordbox." },
  { ids: [1, 2].flatMap((d) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => `pad${p}_${d}`)), name: "Performance-Pads (HOT CUE)", text: "Acht Sprungmarken je Deck. SetTracker belegt sie mit Intro, Drop, Break, Loops und den Mix-Punkten. Ein Druck springt sofort dorthin." },
  { ids: ["loop4_1", "loop4_2"], name: "4 BEAT/EXIT", text: "Setzt sofort eine Schleife über 4 Schläge (einen Takt). Nochmal drücken verlässt den Loop." },
  { ids: ["loopin_1", "loopin_2", "loopout_1", "loopout_2"], name: "LOOP IN / OUT", text: "Loop von Hand: IN am Anfang drücken, OUT am Ende. Die Schleife läuft, bis du sie mit 4 BEAT/EXIT verlässt." },
  { ids: ["loopcall_1", "loopcall_2"], name: "CUE/LOOP CALL ◀ ▶", text: "Springt zwischen gespeicherten Cue- und Loop-Punkten. Während ein Loop läuft: halbiert (◀) bzw. verdoppelt (▶) seine Länge." },
  { ids: ["load_1", "load_2", "browse"], name: "BROWSE und LOAD", text: "Drehregler blättert durch die Trackliste, LOAD lädt den markierten Track auf das jeweilige Deck." },
  { ids: ["trim_1", "trim_2"], name: "TRIM", text: "Eingangspegel des Kanals. Stell beide Kanäle so ein, dass die Pegelanzeige gleich hoch ausschlägt und nicht ins Rote geht." },
  { ids: ["hi_1", "hi_2", "mid_1", "mid_2", "low_1", "low_2"], name: "EQ: HI / MID / LOW", text: "Höhen, Mitten, Bässe je Kanal; 12 Uhr ist neutral. Wichtigste Regel: nie zwei volle Bässe gleichzeitig – einer steht links, bis getauscht wird." },
  { ids: ["cfx_1", "cfx_2"], name: "CFX (Filter)", text: "Ein Regler für einen Filter je Kanal: Mitte neutral, links dumpfer (Low-Pass), rechts dünner (High-Pass). Mit SMART CFX kommen weitere Effekte dazu." },
  { ids: ["hpcue_1", "hpcue_2", "hpmix", "hplevel"], name: "Kopfhörer: CUE, MIX, LEVEL", text: "CUE legt einen Kanal auf den Kopfhörer, auch bei geschlossenem Fader. MIX blendet zwischen Vorhören und Summe, LEVEL ist die Kopfhörer-Lautstärke." },
  { ids: ["fader_1", "fader_2"], name: "Kanalfader", text: "Lautstärke des Kanals auf der Anlage. Unten ist der Kanal stumm – so bereitest du den nächsten Track unhörbar vor." },
  { ids: ["crossfader"], name: "Crossfader", text: "Blendet zwischen linkem und rechtem Deck. Viele mixen nur mit den Kanalfadern und lassen ihn in der Mitte; für Cuts und Smart Fader brauchst du ihn." },
  { ids: ["smart_fader"], name: "SMART FADER", text: "Automatik: Beim Überblenden passt rekordbox Tempo, Bass und Lautstärke an und fügt ein Echo hinzu. Hilft bei großen Temposprüngen." },
  { ids: ["smart_cfx"], name: "SMART CFX", text: "Schaltet den CFX-Regler von reinem Filter auf Effekt-Kombinationen um. Für den Anfang aus lassen." },
  { ids: ["beatfx_select", "beatfx_beat", "beatfx_ch", "beatfx_depth", "beatfx_onoff"], name: "BEAT FX", text: "Tempo-synchrone Effekte wie Echo oder Reverb. SELECT wählt den Effekt, CH den Kanal, BEAT die Länge, LEVEL/DEPTH die Stärke, ON/OFF schaltet ihn." },
  { ids: ["master"], name: "MASTER LEVEL", text: "Gesamtlautstärke zur Anlage. Einmal passend einstellen und während des Sets in Ruhe lassen." },
];

function Controller() {
  const [picked, setPicked] = useState(0);
  const byId = useMemo(() => new Map(CONTROLS.flatMap((c, i) => c.ids.map((id) => [id, i] as const))), []);
  const control = CONTROLS[picked];
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="p-4">
          <Flx4 active={control.ids} onPick={(id) => byId.has(id) && setPicked(byId.get(id)!)} />
          <div className="mt-3 rounded-lg bg-accent-soft px-4 py-3">
            <div className="font-semibold text-accent">{control.name}</div>
            <div className="mt-0.5 text-[13px] leading-relaxed">{control.text}</div>
          </div>
        </Card>
        <p className="text-xs text-faint">Das Schema ist eine vereinfachte Draufsicht des DDJ-FLX4. Klick auf ein Bedienelement oder wähl es rechts aus.</p>
      </div>
      <Card className="h-fit max-h-[640px] overflow-y-auto p-2">
        {CONTROLS.map((c, i) => (
          <button key={c.name} onClick={() => setPicked(i)} aria-pressed={picked === i}
            className={cx("block w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors", picked === i ? "bg-accent-soft font-medium text-accent" : "text-text hover:bg-hover")}>
            {c.name}
          </button>
        ))}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Tipps
const TIPS: { title: string; items: string[] }[] = [
  { title: "Vor dem ersten Übergang", items: [
    "Beide TRIM-Regler so einstellen, dass die Kanäle gleich laut aussteuern – sonst springt die Lautstärke beim Wechsel.",
    "Kanalfader des neuen Decks unten, Kopfhörer-CUE an: So hörst nur du den nächsten Track.",
    "Den Einstieg mit CUE ein paar Mal antippen, bis du das Gefühl für die Eins hast.",
  ] },
  { title: "Beats übereinanderlegen", items: [
    "Erst das Tempo angleichen (BEAT SYNC oder TEMPO-Slider), dann auf die Eins starten.",
    "Laufen die Kicks auseinander: am Rand des Jogwheels kurz anschieben oder bremsen, nicht am Tempo drehen.",
    "Klingt es nach „Galopp“, liegen die Beats versetzt. Hör im Kopfhörer auf die Kick des neuen Tracks.",
  ] },
  { title: "Sauber klingen", items: [
    "Nie zwei volle Bässe gleichzeitig. LOW des neuen Tracks bleibt links, bis du tauschst.",
    "EQ lieber wegnehmen als aufdrehen: Regler rechts von 12 Uhr übersteuern schnell.",
    "Effekte sparsam: ein Echo zum Abschied wirkt, drei Effekte gleichzeitig wirken unsicher.",
  ] },
  { title: "Reihenfolge und Dramaturgie", items: [
    "Tempo in kleinen Schritten steigern (2–3 BPM), Tonarten möglichst benachbart wählen – der Playlist-Check zeigt beides.",
    "Nach zwei, drei energiereichen Tracks darf ein ruhigerer folgen; ein Set braucht Wellen, keinen Dauer-Höhepunkt.",
    "Genrewechsel gelingen am besten über einen Break oder mit einem bewussten Cut auf die Eins.",
  ] },
  { title: "Üben", items: [
    "Nimm zwei Tracks und übe denselben Übergang zehnmal hintereinander, statt jedes Mal neue Tracks zu wählen.",
    "Nimm dich auf (in rekordbox: REC) und hör mit etwas Abstand – Fehler fallen dann sofort auf.",
    "Erst mit BEAT SYNC die Abläufe lernen, später das Angleichen von Hand dazunehmen.",
  ] },
];

function Tips() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {TIPS.map((group) => (
        <Card key={group.title} className="p-5">
          <h2 className="flex items-center gap-2 font-semibold"><GraduationCap size={17} className="text-accent" />{group.title}</h2>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-muted">
            {group.items.map((item) => <li key={item} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{item}</li>)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
