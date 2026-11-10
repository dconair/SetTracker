import { Pause, Play, Repeat, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { TrackDetail, WaveData } from "../types";
import { fmtBpm, fmtTime, IconButton, KeyBadge, SourceTag } from "../ui";
import { Waveform, type Marker } from "../Waveform";

export const cueColor = (name: string) =>
  name.startsWith("LOOP") ? "#ffd84d" : name.startsWith("DROP") ? "#ffa23e" : name.startsWith("BREAK") ? "#b48cff"
    : name.startsWith("BASS") ? "#4db8ff" : /OUT/.test(name) ? "#f2617a" : "#3ecf8e";

/** Track-Details: ganze Waveform mit beschrifteten Phasen, Hot Cues und Loops. */
export function TrackPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { playing, togglePlay } = useStore();
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [wave, setWave] = useState<WaveData | null>(null);

  useEffect(() => {
    setTrack(null);
    setWave(null);
    api.track(id).then((t) => {
      setTrack(t);
      if (t.has_analysis) api.waveform(id).then(setWave).catch(() => {});
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);

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
                  setze sie in rekordbox nach Gehör. Liegt der Track als Datei vor, füge den Ordner hinzu – dann wird er taktgenau analysiert.
                </span>
              </div>
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
            <div className="text-xs text-faint">Dauer {fmtTime(track.duration)}{track.genres.length > 0 && ` · ${track.genres.slice(0, 4).join(", ")}`}</div>
          </div>
        )}
      </div>
    </div>
  );
}
