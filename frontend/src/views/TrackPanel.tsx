import { Link2, Link2Off, Pause, Play, RefreshCw, Repeat, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { Track, TrackDetail, WaveData } from "../types";
import { Button, cx, fmtBpm, fmtTime, IconButton, inputClass, KeyBadge, PhaseStrip, Select, SourceTag, useAction, useToast } from "../ui";
import { Waveform, type Marker } from "../Waveform";

export const cueColor = (name: string) =>
  name.startsWith("LOOP") ? "#ffd84d" : name.startsWith("DROP") ? "#ffa23e" : name.startsWith("BREAK") ? "#b48cff"
    : name.startsWith("BASS") ? "#4db8ff" : /OUT/.test(name) ? "#f2617a" : "#3ecf8e";

/** Track-Details: ganze Waveform mit beschrifteten Phasen, Hot Cues und Loops. */
export function TrackPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { playing, togglePlay, refreshTracks, refreshStatus, dataVersion } = useStore();
  const run = useAction();
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [wave, setWave] = useState<WaveData | null>(null);
  const [candidates, setCandidates] = useState<Track[] | null>(null);
  const [version, setVersion] = useState(0);

  const changed = async () => { setCandidates(null); await Promise.all([refreshTracks(), refreshStatus()]); setVersion((v) => v + 1); };
  const link = async (other: Track) => { if (await run(() => api.linkTrack(id, other.id), "Datei zugeordnet")) changed(); };
  const unlink = async () => { if (await run(() => api.unlinkTrack(id), "Verknüpfung gelöst")) changed(); };

  // Nur beim Wechsel des Tracks zurücksetzen – nicht bei jeder Hintergrund-Aktualisierung.
  useEffect(() => {
    setTrack(null);
    setWave(null);
    setCandidates(null);
  }, [id]);

  useEffect(() => {
    api.track(id).then((t) => {
      setTrack(t);
      if (t.has_analysis) api.waveform(id).then(setWave).catch(() => {});
      else setWave(null);
    });
  }, [id, version, dataVersion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const markers: Marker[] = (track?.cues ?? []).map((c) => ({ time: c.time, label: `${c.pad}`, color: cueColor(c.name) }));
  const estimated = track?.cues[0]?.estimated;

  return (
    <div className="fade fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="slide flex h-full w-full max-w-[760px] flex-col border-l border-line bg-bg" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3.5">
          {track?.path && (
            <IconButton label={playing === id ? "Pause" : "Vorhören"} active={playing === id} onClick={() => togglePlay(track)}>
              {playing === id ? <Pause size={17} /> : <Play size={17} />}
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{track?.title ?? "Lade …"}</div>
            <div className="truncate text-[13px] text-muted">{track?.artist || "Unbekannter Künstler"}</div>
          </div>
          {track && <>
            <SourceTag track={track} />
            <span className="num font-mono text-[13px] text-muted">{fmtBpm(track.bpm)} BPM</span>
            <KeyBadge camelot={track.camelot} name={track.key_name} />
          </>}
          <IconButton label="Schließen" onClick={onClose}><X size={18} /></IconButton>
        </div>

        {!track ? <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-20" />)}</div> : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {track.has_analysis ? (
              <section className="rounded-xl border border-line bg-surface p-4">
                {wave ? <Waveform data={wave} markers={markers} height={132} /> : <div className="skeleton h-[132px]" />}
                <div className="mt-3 flex flex-wrap gap-2">
                  {track.phases.map((p) => (
                    <span key={p.name} className="inline-flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: cueColor(p.name) }} />
                      <b className="font-semibold">{p.name}</b>
                      <span className="num font-mono text-muted">{p.label} · {p.bars} Takte</span>
                    </span>
                  ))}
                </div>
              </section>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-[13px] text-muted">
                <TriangleAlert size={17} className="mt-0.5 shrink-0 text-ok" />
                <span>
                  <b className="font-medium text-text">Nur bei Spotify – keine Audiodatei.</b> Spotify gibt weder Audio noch Strukturdaten heraus, deshalb lassen sich
                  Intro, Drop und Break hier nicht erkennen. Die Marken unten sind ein <b className="font-medium text-text">Raster alle 16 Takte</b> als Orientierung;
                  setze sie in rekordbox nach Gehör. Liegt der Track als Datei vor, füge den Ordner hinzu – dann wird er automatisch zugeordnet und taktgenau analysiert.
                  {track.phases.length > 0 && (
                    <span className="mt-3 block">
                      <PhaseStrip strip={track.strip} />
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {track.phases.map((ph) => <span key={ph.bar} className="num rounded bg-hover px-1.5 py-0.5 font-mono text-[11px]">{ph.name} · {ph.label}</span>)}
                      </span>
                    </span>
                  )}
                  <span className="mt-2.5 block">
                    <Button size="sm" icon={<Link2 size={15} />} onClick={async () => setCandidates((await run(() => api.linkCandidates(id))) ?? [])}>Vorhandene Datei von Hand zuordnen</Button>
                  </span>
                </span>
              </div>
            )}
            {candidates && (
              <section className="rounded-xl border border-line bg-surface p-2">
                <div className="px-2 pt-1.5 pb-2 text-[13px] text-muted">Welche Datei ist dieser Track? (ähnlichste zuerst)</div>
                {candidates.length === 0 ? <div className="px-2 pb-3 text-[13px] text-faint">Keine lokalen Tracks ohne Spotify-Zuordnung vorhanden.</div> : (
                  <div className="max-h-56 overflow-y-auto">
                    {candidates.map((c) => (
                      <button key={c.id} onClick={() => link(c)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{c.title}</span><span className="block truncate text-xs text-muted">{c.artist || "Unbekannt"}</span></span>
                        <span className="num font-mono text-xs text-muted">{fmtBpm(c.bpm)} · {fmtTime(c.duration)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-1 font-semibold">Hot Cues & Loops</h3>
              <p className="mb-3 text-[13px] text-muted">
                {estimated ? "Geschätzte Positionen – in rekordbox von Hand auf die Pads legen." : "Belegung der Performance-Pads am DDJ-FLX4 (Modus HOT CUE). Der rekordbox-Export schreibt sie in die Datei, die Phasen zusätzlich als Memory Cues."}
              </p>
              {track.cues.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint">Für diesen Track liegen noch keine Daten vor.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 8 }, (_, i) => {
                    const cue = track.cues.find((c) => c.pad === i + 1);
                    const color = cue ? cueColor(cue.name) : "var(--line)";
                    return (
                      <div key={i} className="rounded-xl border bg-surface p-3" style={{ borderColor: cue ? `color-mix(in srgb, ${color} 55%, var(--line))` : "var(--line)", opacity: cue ? 1 : 0.5 }}>
                        <div className="flex items-center justify-between">
                          <span className="num flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold" style={{ background: color, color: "#0a0c10" }}>{i + 1}</span>
                          {cue?.kind === "loop" && <Repeat size={14} style={{ color }} />}
                        </div>
                        <div className="mt-2 truncate text-[13px] font-semibold">{cue?.name ?? "frei"}</div>
                        <div className="num font-mono text-xs text-muted">
                          {cue ? <>{cue.label} · Takt {cue.bar}{cue.kind === "loop" && ` · ${cue.bars}-Takt-Loop`}</> : i === 6 ? "Bass-Swap im Set" : "–"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {track.cues.some((c) => c.kind === "loop") && (
              <section className="rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed">
                <div className="mb-1 font-semibold">So nutzt du die Loops am FLX4</div>
                Pad 5 bzw. 6 drücken: Der Track springt in den gespeicherten 4-Takt-Loop und wiederholt ihn. Mit <b className="font-medium">CUE/LOOP CALL ◀ / ▶</b> halbierst
                oder verdoppelst du die Länge, mit <b className="font-medium">4 BEAT/EXIT</b> (bzw. RELOOP/EXIT) läuft der Track normal weiter. LOOP INTRO verlängert ein kurzes Intro beim
                Reinmixen, LOOP OUTRO hält den Beat, bis der nächste Track sitzt.
              </section>
            )}
            <DataEditor track={track} onChanged={changed} />

            {track.path && track.spotify_id && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
                <Link2 size={16} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate" title={track.path}>Mit Spotify verknüpft · Datei: {track.path.split(/[\\/]/).pop()}</span>
                <Button size="sm" variant="ghost" icon={<Link2Off size={15} />} onClick={unlink} title="Falls die falsche Datei zugeordnet wurde: Datei und Spotify-Eintrag wieder trennen">Verknüpfung lösen</Button>
              </div>
            )}
            <div className="text-xs text-faint">Dauer {fmtTime(track.duration)}{track.genres.length > 0 && ` · ${track.genres.slice(0, 4).join(", ")}`}</div>
          </div>
        )}
      </div>
    </div>
  );
}


/** Herkunft der Daten, erneutes Nachschlagen und Korrektur von Hand (BPM, Tonart, Genre). */
function DataEditor({ track, onChanged }: { track: TrackDetail; onChanged: () => void }) {
  const { status } = useStore();
  const run = useAction();
  const toast = useToast();
  const [bpm, setBpm] = useState(track.bpm ? String(track.bpm) : "");
  const [key, setKey] = useState(track.camelot ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBpm(track.bpm ? String(track.bpm) : ""); setKey(track.camelot ?? ""); }, [track.id, track.bpm, track.camelot]);

  const save = async (patch: { bpm?: number; camelot?: string; family?: string }) => {
    if (await run(() => api.patchTrack(track.id, patch), "Gespeichert")) onChanged();
  };
  const scale = (factor: number) => track.bpm && save({ bpm: Math.round(track.bpm * factor * 100) / 100 });
  const retry = async () => {
    setBusy(true);
    const r = await run(() => api.enrichTrack(track.id));
    setBusy(false);
    if (!r) return;
    const got = [r.found.features && "BPM, Tonart und Stimmung", r.found.genres && "Genre"].filter(Boolean).join(" und ");
    toast(got ? `Gefunden: ${got}` : r.complete ? "Die Daten sind bereits vollständig" : "Keine der Quellen kennt diesen Track – bitte von Hand eintragen");
    onChanged();
  };
  const dirty = (bpm && Number(bpm) !== track.bpm) || key.toUpperCase() !== (track.camelot ?? "");
  const source = track.path ? "eigene Analyse der Audiodatei" : track.data_source || "noch keine";

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Daten</h3>
          <div className="text-[13px] text-muted">Quelle: {source}{track.estimated && " – aus einem 30-Sekunden-Ausschnitt geschätzt, bitte gegenprüfen"}</div>
        </div>
        {!track.path && <Button size="sm" icon={<RefreshCw size={14} />} loading={busy} onClick={retry}>Erneut suchen</Button>}
      </div>
      {track.bpm_hint && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-hover px-3 py-2 text-[13px]">
          <TriangleAlert size={15} className="shrink-0 text-ok" /><span className="min-w-0 flex-1">{track.bpm_hint.text}</span>
          {track.bpm_hint.suggest && <Button size="sm" onClick={() => save({ bpm: track.bpm_hint!.suggest! })}>Auf {track.bpm_hint.suggest} BPM korrigieren</Button>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">BPM
          <span className="mt-1 flex gap-1">
            <input value={bpm} onChange={(e) => setBpm(e.target.value.replace(",", "."))} inputMode="decimal" className={cx(inputClass, "num w-24 font-mono")} placeholder="z. B. 124" />
            <Button size="sm" className="h-9" disabled={!track.bpm} onClick={() => scale(0.5)} title="Halbes Tempo">÷2</Button>
            <Button size="sm" className="h-9" disabled={!track.bpm} onClick={() => scale(2)} title="Doppeltes Tempo">×2</Button>
          </span>
        </label>
        <label className="text-xs text-muted">Tonart (Camelot)
          <input value={key} onChange={(e) => setKey(e.target.value)} className={cx(inputClass, "num mt-1 block w-24 font-mono uppercase")} placeholder="z. B. 8A" maxLength={3} />
        </label>
        <label className="text-xs text-muted">Genre
          <Select value={track.family} onChange={(family) => save({ family })} className="mt-1 block">
            <option value="">– ohne –</option>
            {(status?.families ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </label>
        <Button variant="primary" disabled={!dirty} onClick={() => save({ ...(bpm && Number(bpm) !== track.bpm ? { bpm: Number(bpm) } : {}), ...(key.toUpperCase() !== (track.camelot ?? "") && key ? { camelot: key } : {}) })}>Speichern</Button>
      </div>
      {track.path && <p className="mt-2 text-xs text-faint">Bei lokalen Dateien stammen die Werte aus der eigenen Analyse; eine Korrektur von Hand bleibt bestehen, bis die Datei neu analysiert wird.</p>}
    </section>
  );
}
