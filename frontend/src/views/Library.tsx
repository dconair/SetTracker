import { ArrowDown, ArrowUp, ChevronRight, CornerLeftUp, Folder, FolderPlus, Heart, ListPlus, Music2, Pause, Play, Search, Sparkles, Tags, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, openExternal } from "../api";
import { useStore } from "../store";
import type { SpotifyCheck, SpotifyPlaylist, Track } from "../types";
import { Button, Chip, cx, Empty, fmtBpm, fmtTime, IconButton, inputClass, KeyBadge, Menu, MenuItem, Meter, Modal, PageHeader, Select, SourceTag, TrackTitle, useAction, useDialog, useToast } from "../ui";

type SortKey = "title" | "family" | "bpm" | "camelot" | "energy" | "duration";
const NONE = "__none__";
const PAGE = 250;

const camelotOrder = (c: string | null) => (c ? parseInt(c, 10) * 2 + (c.endsWith("B") ? 1 : 0) : 99);

export function SpotifyLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1ed760" aria-hidden>
      <path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm5.05 15.87a.69.69 0 0 1-.94.23c-2.58-1.58-5.83-1.94-9.66-1.06a.69.69 0 0 1-.3-1.34c4.18-.96 7.77-.55 10.67 1.22.33.2.43.62.23.95Zm1.35-3a.86.86 0 0 1-1.18.28c-2.96-1.82-7.46-2.34-10.96-1.28a.86.86 0 1 1-.5-1.64c4-1.21 8.96-.62 12.36 1.46.4.25.53.78.28 1.18Zm.12-3.12c-3.55-2.1-9.4-2.3-12.78-1.27a1.03 1.03 0 1 1-.6-1.97c3.89-1.18 10.35-.95 14.43 1.47a1.03 1.03 0 0 1-1.05 1.77Z" />
    </svg>
  );
}

export function Library() {
  const { tracks, status, sets, refreshTracks, refreshSets, refreshStatus, playing, togglePlay, go, openTrack } = useStore();
  const run = useAction();
  const dialogs = useDialog();
  const [family, setFamily] = useState("");
  const [source, setSource] = useState("");
  const [collection, setCollection] = useState("");
  const [query, setQuery] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "title", dir: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [dialog, setDialog] = useState<"folder" | "spotify" | null>(null);

  const all = tracks ?? [];
  const collections = useMemo(() => [...new Set(all.flatMap((t) => t.collections))].sort((a, b) => a.localeCompare(b)), [all]);

  // Alles außer dem Genre filtern – so zeigen die Genre-Chips, wie viele Tracks dahinter liegen.
  const base = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const min = parseFloat(bpmMin) || 0;
    const max = parseFloat(bpmMax) || 999;
    return all.filter((t) => {
      if (source && t.source !== source) return false;
      if (collection && !t.collections.includes(collection)) return false;
      if ((bpmMin || bpmMax) && (!t.bpm || t.bpm < min || t.bpm > max)) return false;
      if (words.length) {
        const hay = `${t.title} ${t.artist} ${t.album} ${t.genres.join(" ")} ${t.family} ${t.mood}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [all, source, collection, query, bpmMin, bpmMax]);

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of base) counts.set(t.family || NONE, (counts.get(t.family || NONE) ?? 0) + 1);
    return counts;
  }, [base]);

  const rows = useMemo(() => {
    const list = family ? base.filter((t) => (t.family || NONE) === family) : [...base];
    const value = (t: Track): string | number => {
      switch (sort.key) {
        case "title": return `${t.artist} ${t.title}`.toLowerCase();
        case "family": return (t.family || "zzz").toLowerCase();
        case "camelot": return camelotOrder(t.camelot);
        case "bpm": return t.bpm ?? (sort.dir === 1 ? 999 : -1);
        case "energy": return t.energy ?? (sort.dir === 1 ? 9 : -1);
        default: return t.duration;
      }
    };
    return list.sort((a, b) => {
      const va = value(a), vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [base, family, sort]);

  useEffect(() => setLimit(PAGE), [family, source, collection, query, bpmMin, bpmMax]);

  const visibleIds = rows.map((t) => t.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const picked = [...selected].filter((id) => all.some((t) => t.id === id));

  const addToSet = async (setId: number | null, ids: number[]) => {
    if (setId === null) {
      const name = await dialogs.ask("Neues Set", family && family !== NONE ? `${family} Set` : "Neues Set");
      if (!name) return;
      const created = await run(() => api.createSet(name, ids));
      if (created) { await refreshSets(); go(`sets/${created.id}`); }
      return;
    }
    const current = await run(() => api.set(setId));
    if (!current) return;
    const items = [...current.items.map((i) => ({ track_id: i.track.id, pinned: i.pinned })), ...ids.map((id) => ({ track_id: id, pinned: false }))];
    await run(() => api.updateSet(setId, { items }), `${ids.length} Track${ids.length === 1 ? "" : "s"} zu „${current.name}“ hinzugefügt`);
    refreshSets();
    setSelected(new Set());
  };

  const setGenre = async (ids: number[], fam: string) => {
    await run(() => api.bulk(ids, { family: fam }), "Genre gesetzt");
    refreshTracks();
  };

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cx("px-3 py-2.5 font-medium", className)}>
      <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  const missingGenres = all.filter((t) => !t.family).length;
  const localCount = all.filter((t) => t.source === "local").length;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Bibliothek"
        subtitle={tracks === null ? "Lade …" : `${all.length} Tracks · ${localCount} lokal mit Waveform · ${all.length - localCount} nur Spotify`}
      >
        <Button icon={<FolderPlus size={16} />} onClick={() => setDialog("folder")}>Ordner hinzufügen</Button>
        <Button icon={<SpotifyLogo />} onClick={() => setDialog("spotify")}>Spotify importieren</Button>
      </PageHeader>

      {tracks === null ? (
        <div className="space-y-2 px-8">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : all.length === 0 ? (
        <Empty
          icon={<Music2 size={26} />}
          title="Noch keine Tracks"
          action={<>
            <Button variant="primary" icon={<FolderPlus size={16} />} onClick={() => setDialog("folder")}>Musikordner hinzufügen</Button>
            <Button icon={<SpotifyLogo />} onClick={() => setDialog("spotify")}>Spotify importieren</Button>
            <Button variant="ghost" icon={<Sparkles size={16} />} onClick={() => run(async () => { await api.demo(); await refreshTracks(); await refreshStatus(); }, "Demo-Tracks werden analysiert")}>Demo-Tracks laden</Button>
          </>}
        >
          Füge einen Ordner mit Audiodateien hinzu – SetTracker ermittelt BPM, Tonart, Energie und Waveform. Oder importiere deine Spotify-Playlists und Lieblingssongs.
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-3 px-8 pb-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="Genre-Filter">
              <Chip active={!family} onClick={() => setFamily("")} count={base.length}>Alle Genres</Chip>
              {[...familyCounts.entries()].filter(([f]) => f !== NONE).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <Chip key={f} active={family === f} onClick={() => setFamily(family === f ? "" : f)} count={n}>{f}</Chip>
              ))}
              {familyCounts.has(NONE) && <Chip active={family === NONE} onClick={() => setFamily(family === NONE ? "" : NONE)} count={familyCounts.get(NONE)}>Ohne Genre</Chip>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titel, Künstler, Genre oder Stimmung suchen" className={cx(inputClass, "w-full pl-9")} />
              </div>
              <Select value={source} onChange={setSource}>
                <option value="">Alle Quellen</option>
                <option value="local">Lokale Dateien</option>
                <option value="spotify">Nur Spotify</option>
              </Select>
              {collections.length > 0 && (
                <Select value={collection} onChange={setCollection} className="max-w-56">
                  <option value="">Alle Playlists & Ordner</option>
                  {collections.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
              <div className="flex items-center gap-1.5 text-[13px] text-muted">
                BPM
                <input value={bpmMin} onChange={(e) => setBpmMin(e.target.value)} placeholder="von" inputMode="numeric" className={cx(inputClass, "num w-16 px-2 text-center")} aria-label="BPM von" />
                –
                <input value={bpmMax} onChange={(e) => setBpmMax(e.target.value)} placeholder="bis" inputMode="numeric" className={cx(inputClass, "num w-16 px-2 text-center")} aria-label="BPM bis" />
              </div>
            </div>
            {missingGenres > 0 && !status?.spotify.job.running && (family === NONE || missingGenres > all.length / 3) && (
              <div className="fade flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
                <Tags size={16} className="text-accent" />
                <span className="flex-1 text-muted"><b className="font-medium text-text">{missingGenres} Tracks ohne Genre.</b> SetTracker kann sie über den Künstler bei MusicBrainz nachschlagen (ca. 1 Track pro Sekunde).</span>
                <Button size="sm" onClick={() => run(async () => { await api.fillGenres(); await refreshStatus(); }, "Genres werden ergänzt")}>Genres ergänzen</Button>
              </div>
            )}
          </div>

          {selected.size > 0 && (
            <div className="fade sticky top-0 z-20 mx-8 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-raised px-4 py-2.5" style={{ boxShadow: "var(--shadow)" }}>
              <span className="mr-2 text-[13px] font-medium">{picked.length} ausgewählt</span>
              <SetMenu sets={sets} onPick={(id) => addToSet(id, picked)} label="Zu Set hinzufügen" />
              <Menu align="left" trigger={() => <Button size="sm" icon={<Tags size={15} />}>Genre setzen</Button>}>
                {(close) => (status?.families ?? []).map((f) => <MenuItem key={f} onClick={() => { close(); setGenre(picked, f); }}>{f}</MenuItem>)}
              </Menu>
              <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={async () => {
                if (!(await dialogs.confirm(`${picked.length} Tracks aus der Bibliothek entfernen?`, "Die Dateien selbst bleiben erhalten.", { action: "Entfernen", danger: true }))) return;
                await run(() => api.bulk(picked, { delete: true }), "Entfernt");
                setSelected(new Set());
                refreshTracks();
              }}>Entfernen</Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Auswahl aufheben</Button>
            </div>
          )}

          <div className="px-8 pb-10">
            {rows.length === 0 ? (
              <Empty icon={<Search size={24} />} title="Keine Treffer">Kein Track passt zu diesen Filtern.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="w-10 py-2.5 pl-4">
                        <input type="checkbox" aria-label="Alle auswählen" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))} className="accent-(--accent)" />
                      </th>
                      <th className="w-9" />
                      {header("title", "Titel")}
                      {header("family", "Genre")}
                      {header("bpm", "BPM", "text-right")}
                      {header("camelot", "Tonart")}
                      {header("energy", "Energie")}
                      <th className="px-3 py-2.5 font-medium">Stimmung</th>
                      {header("duration", "Dauer", "text-right")}
                      <th className="w-24 px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((t) => (
                      <tr key={t.id} className={cx("group border-b border-line/60 last:border-0 hover:bg-hover/60", selected.has(t.id) && "bg-accent-soft")}>
                        <td className="py-2 pl-4"><input type="checkbox" aria-label={`${t.title} auswählen`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-(--accent)" /></td>
                        <td>
                          {t.path && (
                            <IconButton label={playing === t.id ? "Pause" : "Vorhören"} active={playing === t.id} onClick={() => togglePlay(t)}>
                              {playing === t.id ? <Pause size={15} /> : <Play size={15} />}
                            </IconButton>
                          )}
                        </td>
                        <td className="max-w-0 w-[34%] px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <TrackTitle track={t} onOpen={() => openTrack(t.id)} />
                            <SourceTag track={t} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {t.family ? (
                            <div title={t.genres.join(", ")}>
                              <div className="text-[13px]">{t.family}</div>
                              {t.genres[0] && t.genres[0].toLowerCase() !== t.family.toLowerCase() && <div className="max-w-36 truncate text-xs text-faint">{t.genres[0]}</div>}
                            </div>
                          ) : <span className="text-faint">–</span>}
                        </td>
                        <td className="num px-3 py-2 text-right font-mono text-[13px]"><StatusOr track={t}>{fmtBpm(t.bpm)}</StatusOr></td>
                        <td className="px-3 py-2"><KeyBadge camelot={t.camelot} name={t.key_name} /></td>
                        <td className="px-3 py-2"><Meter value={t.energy} /></td>
                        <td className="px-3 py-2 text-[13px] text-muted">{t.mood || "–"}</td>
                        <td className="num px-3 py-2 text-right text-[13px] text-muted">{fmtTime(t.duration)}</td>
                        <td className="px-3 py-1 text-right">
                          <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <SetMenu sets={sets} onPick={(id) => addToSet(id, [t.id])} compact />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > limit && (
                  <button className="w-full border-t border-line py-3 text-[13px] text-muted hover:bg-hover hover:text-text" onClick={() => setLimit(limit + PAGE)}>
                    {rows.length - limit} weitere anzeigen
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {dialog === "folder" && <FolderDialog onClose={() => setDialog(null)} />}
      {dialog === "spotify" && <SpotifyDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function StatusOr({ track, children }: { track: Track; children: React.ReactNode }) {
  if (track.status === "analyzing") return <span className="text-accent">analysiert …</span>;
  if (track.status === "pending") return <span className="text-faint">wartet</span>;
  if (track.status === "error") return <span className="inline-flex items-center gap-1 text-ok" title={track.error ?? ""}><TriangleAlert size={13} /> keine Daten</span>;
  return <>{children}</>;
}

export function SetMenu({ sets, onPick, label, compact }: { sets: { id: number; name: string }[]; onPick: (id: number | null) => void; label?: string; compact?: boolean }) {
  return (
    <Menu align={compact ? "right" : "left"} trigger={() => compact
      ? <IconButton label="Zu Set hinzufügen"><ListPlus size={16} /></IconButton>
      : <Button size="sm" variant="primary" icon={<ListPlus size={15} />}>{label}</Button>}>
      {(close) => <>
        {sets.map((s) => <MenuItem key={s.id} onClick={() => { close(); onPick(s.id); }}>{s.name}</MenuItem>)}
        {sets.length > 0 && <div className="my-1 border-t border-line" />}
        <MenuItem icon={<ListPlus size={15} />} onClick={() => { close(); onPick(null); }}>Neues Set …</MenuItem>
      </>}
    </Menu>
  );
}

export function FolderDialog({ onClose }: { onClose: () => void }) {
  const { refreshTracks, refreshStatus } = useStore();
  const run = useAction();
  const toast = useToast();
  const [dir, setDir] = useState<{ path: string; parent: string | null; dirs: string[]; audio_files: number } | null>(null);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);

  const open = async (p: string) => {
    const result = await run(() => api.fs(p));
    if (result) { setDir(result); setPath(result.path); }
  };
  useEffect(() => { open(""); }, []);  // eslint-disable-line

  const scan = async () => {
    setLoading(true);
    const result = await run(() => api.scan(path));
    setLoading(false);
    if (!result) return;
    toast(result.found === 0 ? "Keine Audiodateien in diesem Ordner gefunden"
      : `${result.found} Dateien gefunden` + (result.linked ? `, ${result.linked} davon Spotify-Tracks zugeordnet` : "") + " – Analyse läuft");
    await refreshTracks();
    await refreshStatus();
    onClose();
  };
  const sep = dir?.path.includes("\\") ? "\\" : "/";

  return (
    <Modal title="Musikordner hinzufügen" onClose={onClose} wide footer={<>
      <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
      <Button variant="primary" loading={loading} onClick={scan}>Diesen Ordner analysieren</Button>
    </>}>
      <p className="mb-3 text-[13px] text-muted">Alle Audiodateien im Ordner und seinen Unterordnern werden aufgenommen und analysiert. Dateien, die zu einem Spotify-Track in deiner Bibliothek gehören, werden ihm automatisch zugeordnet. Die Dateien bleiben unverändert an ihrem Ort.</p>
      <form onSubmit={(e) => { e.preventDefault(); open(path); }} className="flex gap-2">
        <input value={path} onChange={(e) => setPath(e.target.value)} className={cx(inputClass, "flex-1 font-mono text-[13px]")} aria-label="Ordnerpfad" spellCheck={false} />
        <Button type="submit">Öffnen</Button>
      </form>
      <div className="mt-3 h-64 overflow-y-auto rounded-lg border border-line bg-bg p-1.5">
        {dir?.parent && <MenuItem icon={<CornerLeftUp size={15} />} onClick={() => open(dir.parent!)}>Übergeordneter Ordner</MenuItem>}
        {dir?.dirs.map((d) => (
          <button key={d} onClick={() => open(`${dir.path.replace(/[\\/]$/, "")}${sep}${d}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hover">
            <Folder size={15} className="text-muted" /><span className="flex-1 truncate">{d}</span><ChevronRight size={14} className="text-faint" />
          </button>
        ))}
        {dir && dir.dirs.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-faint">Keine Unterordner</div>}
      </div>
      {dir && <div className="mt-2.5 text-[13px] text-muted">{dir.audio_files > 0 ? `${dir.audio_files} Audiodateien direkt in diesem Ordner` : "Keine Audiodateien direkt in diesem Ordner (Unterordner werden mit durchsucht)"}</div>}
    </Modal>
  );
}

export function SpotifyDialog({ onClose, asSet, onImported }: { onClose: () => void; asSet?: boolean; onImported?: (setId: number) => void }) {
  const { status, refreshTracks, refreshStatus, refreshSets } = useStore();
  const run = useAction();
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<SpotifyCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [loginUrl, setLoginUrl] = useState("");
  const sp = status?.spotify;
  useEffect(() => {
    if (!waiting || sp?.user) return;
    const timer = setInterval(() => refreshStatus().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [waiting, sp?.user, refreshStatus]);
  const runCheck = async () => {
    setChecking(true);
    setCheck((await run(() => api.spotifyCheck())) ?? null);
    setChecking(false);
  };

  useEffect(() => {
    if (sp?.user) run(() => api.spotifyPlaylists()).then((p) => setPlaylists(p ?? []));
  }, [sp?.user?.id]);  // eslint-disable-line

  const importOne = async (key: string, body: { playlist_id?: string; liked?: boolean }) => {
    setBusy(key);
    const result = await run(() => api.spotifyImport({ ...body, as_set: asSet }));
    setBusy(null);
    if (!result) return;
    await Promise.all([refreshTracks(), refreshStatus(), refreshSets()]);
    if (asSet && result.set_id) { onImported?.(result.set_id); onClose(); }
  };

  return (
    <Modal title={<span className="flex items-center gap-2"><SpotifyLogo size={18} /> {asSet ? "Spotify-Playlist prüfen" : "Aus Spotify importieren"}</span>} onClose={onClose} wide>
      {!sp?.configured ? (
        <CredentialsForm redirectUri={sp?.redirect_uri ?? ""} onSaved={refreshStatus} />
      ) : !sp.user ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="max-w-sm text-muted">Melde dich an, damit SetTracker deine Playlists und Lieblingssongs lesen und fertige Sets als Playlist anlegen kann.</p>
          <Button variant="primary" className="mt-5" icon={<SpotifyLogo />} onClick={async () => {
            const r = await run(() => api.spotifyLogin());
            if (!r) return;
            if (!status?.desktop) { window.location.href = r.url; return; }
            setLoginUrl(r.url);
            setWaiting(true);
            await run(() => openExternal(r.url, true));
          }}>Mit Spotify anmelden</Button>
          {waiting && (
            <div className="mt-4 w-full max-w-md text-[13px]">
              <p className="text-accent">Die Spotify-Anmeldung wurde in deinem Browser geöffnet. Nach dem Bestätigen geht es hier automatisch weiter.</p>
              <p className="mt-3 text-muted">Kein Browserfenster aufgegangen? Dann diese Adresse kopieren und im Browser einfügen:</p>
              <input readOnly value={loginUrl} onFocus={(e) => e.target.select()} className={cx(inputClass, "mt-1.5 w-full font-mono text-xs")} aria-label="Anmelde-Adresse" />
            </div>
          )}
          <p className="mt-5 max-w-md text-xs text-faint">
            Meldet Spotify „INVALID_CLIENT: Invalid redirect URI“? Dann fehlt im Spotify Developer Dashboard bei deiner App unter „Redirect URIs“ dieser Eintrag
            (nur dort eintragen, nicht im Browser öffnen):{" "}
            <code className="rounded bg-hover px-1.5 py-0.5 font-mono text-text select-all">{sp.redirect_uri}</code>
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px] text-muted">
            <span>Angemeldet als <b className="font-medium text-text">{sp.user.name}</b></span>
            <button className="hover:text-text hover:underline" onClick={async () => { await run(() => api.spotifyLogout()); refreshStatus(); }}>Abmelden</button>
          </div>
          {!asSet && <p className="mb-3 text-[13px] text-muted">BPM, Tonart und Energie kommen von ReccoBeats, Genres von MusicBrainz – Spotify selbst liefert diese Daten nicht mehr. Eine Waveform gibt es nur für lokale Dateien.</p>}
          <div className="space-y-1.5">
            <ImportRow icon={<span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent"><Heart size={18} /></span>} name="Lieblingssongs" detail="Alle gespeicherten Titel" loading={busy === "liked"} disabled={!!busy} onClick={() => importOne("liked", { liked: true })} action={asSet ? "Prüfen" : "Importieren"} />
            {playlists === null && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-14" />)}
            {playlists?.map((p) => (
              <ImportRow key={p.id} icon={p.image ? <img src={p.image} alt="" className="h-10 w-10 rounded-md object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-hover text-muted"><Music2 size={18} /></span>}
                name={p.name} detail={[p.count !== null ? `${p.count} Titel` : null, p.owner].filter(Boolean).join(" · ")} loading={busy === p.id} disabled={!!busy} onClick={() => importOne(p.id, { playlist_id: p.id })} action={asSet ? "Prüfen" : "Importieren"} />
            ))}
            {playlists?.length === 0 && <div className="py-6 text-center text-[13px] text-faint">Keine Playlists gefunden</div>}
          </div>
        </>
      )}
      {sp?.configured && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Funktioniert etwas nicht?</span>
            <Button size="sm" loading={checking} onClick={runCheck}>Verbindung prüfen</Button>
          </div>
          {check && (
            <ul className="mt-3 space-y-2">
              {check.steps.map((st) => (
                <li key={st.name} className="flex items-start gap-2.5 text-[13px]">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: st.ok ? "var(--good)" : "var(--bad)" }} />
                  <span className="min-w-0">
                    <span className="font-medium">{st.name}</span>{st.ok && st.detail && <span className="text-muted"> · {st.detail}</span>}
                    {!st.ok && <span className="block text-muted">{st.hint}{st.detail && <span className="block font-mono text-xs text-faint">{st.detail}</span>}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function CredentialsForm({ redirectUri, onSaved }: { redirectUri: string; onSaved: () => Promise<void> }) {
  const run = useAction();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await run(() => api.spotifyCredentials(id, secret), "Zugangsdaten gespeichert");
    setSaving(false);
    if (ok) await onSaved();
  };
  return (
    <form onSubmit={save} className="space-y-4 text-[13px]">
      <p className="text-muted">Spotify verlangt für den Zugriff eine eigene, kostenlose „App“ in deinem Konto. Das dauert etwa zwei Minuten und ist nur einmal nötig.</p>
      <ol className="list-decimal space-y-2 pl-5 text-muted">
        <li><a className="text-accent hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> öffnen, anmelden und „Create app“ wählen (Spotify Premium nötig). Name und Beschreibung sind frei wählbar.</li>
        <li>Bei „Redirect URIs“ genau diese Adresse eintragen: <code className="rounded bg-hover px-1.5 py-0.5 font-mono text-xs text-text select-all">{redirectUri}</code></li>
        <li>Bei „Which API/SDKs are you planning to use?“ „Web API“ ankreuzen und speichern.</li>
        <li>In den App-Einstellungen Client ID und Client Secret kopieren und hier einfügen.</li>
      </ol>
      <label className="block">
        <span className="mb-1.5 block font-medium">Client ID</span>
        <input value={id} onChange={(e) => setId(e.target.value)} className={cx(inputClass, "w-full font-mono text-[13px]")} spellCheck={false} autoComplete="off" required />
      </label>
      <label className="block">
        <span className="mb-1.5 block font-medium">Client Secret</span>
        <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" className={cx(inputClass, "w-full font-mono text-[13px]")} autoComplete="off" required />
      </label>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-faint">Die Daten bleiben auf diesem Rechner (Ordner .settracker in deinem Benutzerordner).</span>
        <Button type="submit" variant="primary" loading={saving}>Speichern</Button>
      </div>
    </form>
  );
}

function ImportRow({ icon, name, detail, onClick, loading, disabled, action }: { icon: React.ReactNode; name: string; detail: string; onClick: () => void; loading: boolean; disabled: boolean; action: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-xs text-muted">{detail}</div>
      </div>
      <Button size="sm" loading={loading} disabled={disabled} onClick={onClick}>{action}</Button>
    </div>
  );
}
