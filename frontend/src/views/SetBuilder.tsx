import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, CheckCircle2, ChevronDown, ClipboardCopy, Compass, Download, FolderPlus, RefreshCw, FileCode2, FileText, GripVertical, ListMusic, ListPlus, Pin, Plus, Printer, ScanSearch, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { SetView, Suggestion, Track, Transition } from "../types";
import { Button, Card, cx, Empty, fmtBpm, fmtLong, IconButton, KeyBadge, Menu, MenuItem, Meter, Modal, PageHeader, ScoreBadge, Select, changesText, SourceTag, TrackTitle, useAction, useToast, verdictColor } from "../ui";
import { FolderDialog, SpotifyLogo } from "./Library";
import { TransitionPanel } from "./TransitionPanel";

export function SetList() {
  const { sets, refreshSets, go } = useStore();
  const run = useAction();
  const create = async () => {
    const name = window.prompt("Name des neuen Sets", "Neues Set");
    if (!name) return;
    const created = await run(() => api.createSet(name));
    if (created) { await refreshSets(); go(`sets/${created.id}`); }
  };
  return (
    <div>
      <PageHeader title="Sets" subtitle="Stelle Set-Listen zusammen und plane die Übergänge.">
        <Button variant="primary" icon={<Plus size={16} />} onClick={create}>Neues Set</Button>
      </PageHeader>
      {sets.length === 0 ? (
        <Empty icon={<ListMusic size={26} />} title="Noch kein Set" action={<Button variant="primary" icon={<Plus size={16} />} onClick={create}>Erstes Set anlegen</Button>}>
          Lege ein Set an und füge Tracks aus der Bibliothek hinzu – SetTracker bewertet jeden Übergang und schlägt passende Tracks vor.
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 px-8 pb-10">
          {sets.map((s) => (
            <button key={s.id} onClick={() => go(`sets/${s.id}`)} className="rise group rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-raised">
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><ListMusic size={19} /></div>
              <div className="truncate font-semibold">{s.name}</div>
              <div className="mt-0.5 truncate text-[13px] text-muted">{s.count} Tracks{s.origin ? ` · ${s.origin}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Energieverlauf des Sets (Linie) gegen die gewünschte Kurve (gestrichelt). */
export function EnergyChart({ energy, targets, height = 56 }: { energy: number[]; targets?: (number | null)[]; height?: number }) {
  if (energy.length < 2) return null;
  const w = 600;
  const pad = 6;
  const pt = (v: number, i: number) => `${(i / (energy.length - 1)) * w},${pad + (1 - v) * (height - pad * 2)}`;
  const line = energy.map(pt).join(" ");
  const hasTarget = targets && targets.every((t) => t !== null);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label="Energieverlauf">
      <polygon points={`0,${height} ${line} ${w},${height}`} fill="var(--accent)" opacity={0.1} />
      {hasTarget && <polyline points={(targets as number[]).map(pt).join(" ")} fill="none" stroke="var(--faint)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function SetBuilder({ id }: { id: number }) {
  const { status, refreshSets, go, dataVersion } = useStore();
  const run = useAction();
  const [view, setView] = useState<SetView | null>(null);
  const [missing, setMissing] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [openTransition, setOpenTransition] = useState<number | null>(null);
  const [sorting, setSorting] = useState(false);
  const [exported, setExported] = useState<{ url: string; added: number; missing: string[] } | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [folder, setFolder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const load = useCallback(() => api.set(id).then(setView).catch(() => setMissing(true)), [id]);
  useEffect(() => { load(); }, [load, dataVersion]);

  const save = async (items: { track_id: number; pinned: boolean }[]) => {
    const next = await run(() => api.updateSet(id, { items }));
    if (next) { setView(next); refreshSets(); }
  };
  const itemsOf = (v: SetView) => v.items.map((i) => ({ track_id: i.track.id, pinned: i.pinned }));

  if (missing) return <Empty icon={<ListMusic size={26} />} title="Set nicht gefunden" action={<Button onClick={() => go("sets")}>Zu den Sets</Button>} />;
  if (!view) return <div className="space-y-2 p-8">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-14" />)}</div>;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = view.items.findIndex((i) => i.track.id === e.active.id);
    const to = view.items.findIndex((i) => i.track.id === e.over!.id);
    const moved = arrayMove(view.items, from, to);
    setView({ ...view, items: moved, rating: { ...view.rating, transitions: [] } });
    save(moved.map((i) => ({ track_id: i.track.id, pinned: i.pinned })));
  };
  const addTrack = (track: Track, at: number | null) => {
    const items = itemsOf(view);
    items.splice(at ?? items.length, 0, { track_id: track.id, pinned: false });
    setInsertAt(null);
    return save(items);
  };
  const autosort = async () => {
    setSorting(true);
    const next = await run(() => api.autosort(id));
    setSorting(false);
    if (!next) return;
    setView(next);
  };
  const transitions = new Map(view.rating.transitions.map((t) => [t.index, t]));
  const total = view.items.length;
  const missingTracks = view.items.filter((i) => !i.track.path);
  const refresh = async () => {
    setRefreshing(true);
    const r = await run(() => api.refreshSet(id));
    setRefreshing(false);
    if (r) { setView(r.set); toast(changesText(r.changes)); refreshSets(); }
  };
  const copyMissing = async () => {
    const text = missingTracks.map((i) => `${i.track.artist} – ${i.track.title}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast(`${missingTracks.length} Titel kopiert`); } catch { toast("Kopieren nicht möglich – bitte die CSV nutzen", "error"); }
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={<span className="flex items-center gap-2">
          <IconButton label="Zurück zu den Sets" onClick={() => go("sets")}><ArrowLeft size={18} /></IconButton>
          <input
            defaultValue={view.name} key={view.name} aria-label="Set-Name"
            onBlur={(e) => e.target.value.trim() && e.target.value !== view.name && run(() => api.updateSet(id, { name: e.target.value.trim() })).then((v) => { if (v) { setView(v); refreshSets(); } })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="-ml-1 min-w-0 rounded-md bg-transparent px-1 outline-none hover:bg-hover focus:bg-hover"
          />
        </span>}
        subtitle={<span className="pl-10">{total} Tracks · {fmtLong(view.duration)}{view.origin ? ` · ${view.origin}` : ""}</span>}
      >
        {view.spotify_playlist_id && <Button icon={<RefreshCw size={16} />} loading={refreshing} onClick={refresh} title="Playlist erneut aus Spotify laden – Inhalt und Reihenfolge werden übernommen">Aus Spotify aktualisieren</Button>}
        <Button icon={<Wand2 size={16} />} loading={sorting} disabled={total < 3} onClick={autosort} title="Reihenfolge für bessere Übergänge optimieren (angepinnte Tracks bleiben)">Auto-Sortieren</Button>
        <Button icon={<ScanSearch size={16} />} disabled={total < 2} onClick={() => go(`check/${id}`)}>Playlist-Check</Button>
        <Menu trigger={() => <Button variant="primary" icon={<Download size={16} />} disabled={total === 0}>Export <ChevronDown size={14} /></Button>}>
          {(close) => <>
            <MenuItem icon={<SpotifyLogo size={15} />} onClick={async () => { close(); const r = await run(() => api.exportSpotify(id)); if (r) setExported(r); }}>Als Spotify-Playlist anlegen</MenuItem>
            <MenuItem icon={<FileCode2 size={15} />} onClick={() => { close(); window.location.href = `/api/sets/${id}/export/rekordbox.xml`; }}>rekordbox-XML mit Hot Cues</MenuItem>
            <MenuItem icon={<FileText size={15} />} onClick={() => { close(); window.location.href = `/api/sets/${id}/export/playlist.m3u`; }}>M3U-Playlist</MenuItem>
            <MenuItem icon={<Printer size={15} />} onClick={() => { close(); window.open(`/api/sets/${id}/export/cheatsheet.html`, "_blank"); }}>Spickzettel mit FLX4-Schritten</MenuItem>
            <div className="my-1 border-t border-line" />
            <MenuItem danger icon={<Trash2 size={15} />} onClick={async () => { close(); if (window.confirm(`Set „${view.name}“ löschen?`)) { await run(() => api.deleteSet(id)); await refreshSets(); go("sets"); } }}>Set löschen</MenuItem>
          </>}
        </Menu>
      </PageHeader>

      <div className="grid flex-1 grid-cols-1 gap-5 px-8 pb-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {total >= 2 && (
            <Card className="mb-4 p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <div className="text-xs text-muted">Übergänge gesamt</div>
                  <div className="mt-1 flex items-center gap-2.5">
                    <ScoreBadge score={view.rating.overall} verdict={view.rating.verdict} size="lg" />
                    <span className="font-medium">{view.rating.grade}</span>
                  </div>
                </div>
                <div className="flex gap-4 text-[13px]">
                  {(["good", "ok", "bad"] as const).map((v) => (
                    <span key={v} className="flex items-center gap-1.5 text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: verdictColor[v] }} />
                      <b className="num font-semibold text-text">{view.rating.counts[v]}</b> {v === "good" ? "gut" : v === "ok" ? "okay" : "kritisch"}
                    </span>
                  ))}
                </div>
                <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
                  Energiekurve
                  <Select value={view.curve} onChange={(curve) => run(() => api.updateSet(id, { curve })).then((v) => v && setView(v))}>
                    {Object.entries(status?.curves ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </Select>
                </label>
              </div>
              <div className="mt-3"><EnergyChart energy={view.rating.energy} targets={view.targets} /></div>
            </Card>
          )}

          {total > 0 && (missingTracks.length > 0 || view.files.local > 0) && (
            <Card className="mb-4 p-4">
              {missingTracks.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <CheckCircle2 size={18} className="shrink-0 text-good" />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <b className="font-semibold">Alle {total} Tracks liegen als Datei vor.</b>{" "}
                    <span className="text-muted">{view.files.analyzed < total ? `${total - view.files.analyzed} werden noch analysiert.` : "Hot Cues, Loops und Übergänge sind taktgenau."}</span>
                  </span>
                  {view.files.analyzed === total && <Button size="sm" icon={<FileCode2 size={15} />} onClick={() => { window.location.href = `/api/sets/${id}/export/rekordbox.xml`; }}>rekordbox-XML exportieren</Button>}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-[13px]"><b className="num font-semibold">{view.files.local} von {total}</b> <span className="text-muted">Tracks als Datei vorhanden</span></span>
                    <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-good transition-[width] duration-500" style={{ width: `${(view.files.local / total) * 100}%` }} /></div>
                    <button onClick={() => setOnlyMissing(!onlyMissing)} aria-pressed={onlyMissing} className={cx("h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", onlyMissing ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-hover hover:text-text")}>Nur fehlende zeigen ({missingTracks.length})</button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-xs text-muted">Für die fehlenden Tracks gibt es noch keine Waveform und nur geschätzte Mix-Punkte. Lege die Dateien in einen Ordner und füge ihn hinzu – sie werden automatisch zugeordnet.</span>
                    <Button size="sm" variant="ghost" icon={<ClipboardCopy size={15} />} onClick={copyMissing}>Liste kopieren</Button>
                    <Button size="sm" variant="ghost" icon={<FileText size={15} />} onClick={() => { window.location.href = `/api/sets/${id}/missing.csv`; }}>Als CSV</Button>
                    <Button size="sm" icon={<FolderPlus size={15} />} onClick={() => setFolder(true)}>Ordner hinzufügen</Button>
                  </div>
                </>
              )}
            </Card>
          )}

          {total === 0 ? (
            <Card><Empty icon={<ListPlus size={26} />} title="Das Set ist noch leer" action={<Button variant="primary" onClick={() => go("bibliothek")}>Zur Bibliothek</Button>}>
              Wähle in der Bibliothek Tracks aus und füge sie diesem Set hinzu. Danach schlägt Smart Shuffle hier passende nächste Tracks vor.
            </Empty></Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={view.items.map((i) => i.track.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {view.items.map((item, index) => (
                    <div key={item.track.id} hidden={onlyMissing && !!item.track.path}>
                      <SetRow
                        track={item.track} index={index} pinned={item.pinned}
                        onPin={() => save(view.items.map((i) => ({ track_id: i.track.id, pinned: i.track.id === item.track.id ? !i.pinned : i.pinned })))}
                        onRemove={() => save(itemsOf(view).filter((i) => i.track_id !== item.track.id))}
                      />
                      {index < total - 1 && !onlyMissing && (
                        <TransitionChip transition={transitions.get(index)} active={insertAt === index + 1}
                          onOpen={() => setOpenTransition(index)} onInsert={() => setInsertAt(insertAt === index + 1 ? null : index + 1)} />
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <aside className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-40px)] xl:self-start">
          <SuggestPanel key={view.items.map((i) => i.track.id).join("-")} view={view} insertAt={insertAt} onClearInsert={() => setInsertAt(null)} onAdd={addTrack} />
        </aside>
      </div>

      {folder && <FolderDialog onClose={() => setFolder(false)} />}
      {openTransition !== null && <TransitionPanel setId={id} index={openTransition} total={total - 1} onClose={() => { setOpenTransition(null); load(); }} onNavigate={setOpenTransition} />}
      {exported && (
        <Modal title="Spotify-Playlist angelegt" onClose={() => setExported(null)} footer={<>
          <Button variant="ghost" onClick={() => setExported(null)}>Schließen</Button>
          <Button variant="primary" icon={<SpotifyLogo />} onClick={() => window.open(exported.url, "_blank")}>In Spotify öffnen</Button>
        </>}>
          <p>{exported.added} Tracks wurden in die neue private Playlist „{view.name}“ übernommen. In rekordbox findest du sie mit Spotify Premium unter „Spotify“ und kannst sie direkt auf den DDJ-FLX4 laden.</p>
          {exported.missing.length > 0 && <>
            <p className="mt-4 text-[13px] font-medium text-ok">Bei Spotify nicht gefunden:</p>
            <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">{exported.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </>}
        </Modal>
      )}
    </div>
  );
}

function SetRow({ track, index, pinned, onPin, onRemove }: { track: Track; index: number; pinned: boolean; onPin: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const { openTrack } = useStore();
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, boxShadow: isDragging ? "var(--shadow)" : undefined }}
      className={cx("group relative flex items-center gap-3 rounded-xl border bg-surface py-2.5 pr-2 pl-1.5", isDragging ? "z-10 border-accent" : "border-line")}
    >
      <button {...attributes} {...listeners} aria-label={`${track.title} verschieben`} className="flex h-8 w-6 cursor-grab items-center justify-center rounded text-faint hover:text-text active:cursor-grabbing">
        <GripVertical size={16} />
      </button>
      <span className="num w-5 text-center text-[13px] font-semibold text-muted">{index + 1}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TrackTitle track={track} onOpen={() => openTrack(track.id)} />
        <SourceTag track={track} />
      </div>
      <span className="hidden w-28 truncate text-[13px] text-muted md:block">{track.family || "–"}</span>
      <span className="num w-14 text-right font-mono text-[13px]">{fmtBpm(track.bpm)}</span>
      <span className="flex w-12 justify-center"><KeyBadge camelot={track.camelot} name={track.key_name} /></span>
      <span className="hidden sm:block"><Meter value={track.energy} /></span>
      <IconButton label={pinned ? "Position lösen" : "Position fixieren (bleibt beim Auto-Sortieren)"} active={pinned} onClick={onPin} className={cx(!pinned && "opacity-0 group-hover:opacity-100 focus:opacity-100")}><Pin size={15} /></IconButton>
      <IconButton label="Aus dem Set entfernen" onClick={onRemove} className="opacity-0 group-hover:opacity-100 focus:opacity-100"><X size={16} /></IconButton>
    </div>
  );
}

function TransitionChip({ transition, onOpen, onInsert, active }: { transition?: Transition; onOpen: () => void; onInsert: () => void; active: boolean }) {
  return (
    <div className="group/chip relative ml-[42px] flex items-center gap-2 py-1">
      <span className="h-7 w-px bg-line" />
      {transition && transition.confidence < 0.4 ? (
        <span className="px-2 py-1 text-xs text-faint">Noch zu wenig Daten für eine Bewertung</span>
      ) : transition ? (
        <button onClick={onOpen} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-hover" title="Übergang planen">
          <ScoreBadge score={transition.score} verdict={transition.verdict} />
          <span className="truncate text-xs text-muted">{(transition.verdict === "bad" && transition.issues.length ? transition.issues : transition.reasons).join(" · ")}</span>
          <span className="shrink-0 text-xs font-medium text-accent opacity-0 group-hover/chip:opacity-100">Übergang ansehen</span>
        </button>
      ) : <span className="skeleton h-5 w-40" />}
      <IconButton label="Hier einen Track einfügen" active={active} onClick={onInsert} className={cx("ml-auto", !active && "opacity-0 group-hover/chip:opacity-100 focus:opacity-100")}><Plus size={15} /></IconButton>
    </div>
  );
}

function SuggestPanel({ view, insertAt, onClearInsert, onAdd }: { view: SetView; insertAt: number | null; onClearInsert: () => void; onAdd: (t: Track, at: number | null) => Promise<void> }) {
  const { status, refreshTracks, dataVersion } = useStore();
  const run = useAction();
  const [tab, setTab] = useState<"library" | "discover">("library");
  const [family, setFamily] = useState("");
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const request = useRef(0);
  const hasSpotifySeed = view.items.some((i) => i.track.spotify_id);

  useEffect(() => {
    if (view.items.length === 0) { setItems([]); return; }
    const mine = ++request.current;
    setItems(null);
    const job = tab === "library" ? api.suggest(view.id, insertAt, family) : api.discover(view.id);
    job.then((r) => mine === request.current && setItems(r)).catch(() => mine === request.current && setItems([]));
  }, [view.id, tab, family, insertAt, view.items.length, dataVersion]);

  const add = async (s: Suggestion) => {
    let track = s.track;
    if (track.id < 0) {
      const created = await run(() => api.addSpotifyTrack(track));
      if (!created) return;
      track = created;
      refreshTracks();
    }
    await onAdd(track, insertAt);
  };
  const anchor = insertAt !== null ? view.items[insertAt - 1]?.track : view.items[view.items.length - 1]?.track;

  return (
    <Card className="flex max-h-[inherit] flex-col overflow-hidden">
      <div className="border-b border-line p-4 pb-3">
        <div className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-accent" /> Smart Shuffle</div>
        <div className="mt-1 text-[13px] text-muted">
          {view.items.length === 0 ? "Füge einen ersten Track hinzu, dann erscheinen hier Vorschläge." : insertAt !== null
            ? <>Passend zwischen Platz {insertAt} und {insertAt + 1} · <button className="text-accent hover:underline" onClick={onClearInsert}>ans Ende wechseln</button></>
            : <>Passend nach „{anchor?.title}“</>}
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-bg p-1">
          {([["library", "Aus der Bibliothek", <ListMusic size={14} key="l" />], ["discover", "Entdecken", <Compass size={14} key="d" />]] as const).map(([key, label, icon]) => (
            <button key={key} onClick={() => setTab(key)} className={cx("flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors", tab === key ? "bg-raised text-text shadow-sm" : "text-muted hover:text-text")}>{icon}{label}</button>
          ))}
        </div>
        {tab === "library" && (
          <Select value={family} onChange={setFamily} className="mt-2 w-full">
            <option value="">Alle Genres</option>
            {(status?.families ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items === null ? Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton m-1 h-14" />)
          : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted">
              {tab === "discover" && !hasSpotifySeed ? "Zum Entdecken braucht das Set mindestens einen Track mit Spotify-Verknüpfung." : view.items.length === 0 ? "Noch keine Vorschläge." : "Keine passenden Tracks gefunden."}
            </div>
          ) : items.map((s) => (
            <div key={`${s.track.id}-${s.track.spotify_id}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-hover">
              <ScoreBadge score={s.score} verdict={s.verdict} />
              <div className="min-w-0 flex-1">
                <TrackTitle track={s.track} compact />
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-faint">
                  <span className="num font-mono">{fmtBpm(s.track.bpm)}</span>
                  {s.track.camelot && <span className="font-mono">{s.track.camelot}</span>}
                  <span className="truncate">{s.reasons.filter((r) => !/BPM|Tempo|→/.test(r)).join(" · ")}</span>
                </div>
              </div>
              <IconButton label="Zum Set hinzufügen" onClick={() => add(s)}><Plus size={16} /></IconButton>
            </div>
          ))}
      </div>
    </Card>
  );
}
