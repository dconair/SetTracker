import { ArrowLeft, ArrowRight, ArrowRightLeft, Check as CheckIcon, CircleAlert, FileUp, Info, ListMusic, Loader2, Pin, RefreshCw, ScanSearch, TrendingUp, TriangleAlert, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import type { FixOption, PlanBrief, Rating, Review, Track } from "../types";
import { Button, Card, cx, Empty, fmtBpm, IconButton, KeyBadge, changesText, moodColor, PageHeader, ScoreBadge, Select, useAction, useToast, verdictColor } from "../ui";
import { SpotifyDialog, SpotifyLogo } from "./Library";
import { EnergyChart } from "./SetBuilder";
import { TransitionPanel } from "./TransitionPanel";

export function Check({ id }: { id: number | null }) {
  return id === null ? <CheckStart /> : <CheckResult id={id} />;
}

function CheckStart() {
  const { sets, go, refreshSets, refreshTracks, refreshStatus } = useStore();
  const run = useAction();
  const [spotify, setSpotify] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setUploading(true);
    const result = await run(() => api.importFile(f));
    setUploading(false);
    if (!result) return;
    await Promise.all([refreshSets(), refreshTracks(), refreshStatus()]);
    go(`check/${result.set_ids[0]}`);
  };

  return (
    <div>
      <PageHeader title="Playlist-Check" subtitle="Prüfe eine fertige Playlist: Passen die Übergänge von Song zu Song – oder lohnt sich ein Umbau?" />
      <div className="grid grid-cols-1 gap-4 px-8 pb-6 md:grid-cols-2">
        <SourceCard icon={<SpotifyLogo size={22} />} title="Spotify-Playlist" text="Eine deiner Playlists oder deine Lieblingssongs laden und bewerten." action={<Button variant="primary" onClick={() => setSpotify(true)}>Playlist wählen</Button>} />
        <SourceCard icon={<FileUp size={22} />} title="Datei laden" text="M3U-Playlist oder rekordbox-XML – die Audiodateien werden hier auf dem Rechner analysiert." action={<>
          <input ref={file} type="file" accept=".m3u,.m3u8,.xml" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button loading={uploading} onClick={() => file.current?.click()}>Datei auswählen</Button>
        </>} />
      </div>
      <div className="px-8 pb-10">
        <h2 className="mb-3 text-[13px] font-medium text-muted">Oder ein vorhandenes Set prüfen</h2>
        {sets.length === 0 ? (
          <Card className="px-5 py-8 text-center text-[13px] text-muted">Noch keine Sets vorhanden.</Card>
        ) : (
          <Card className="divide-y divide-line/70 overflow-hidden">
            {sets.map((s) => (
              <button key={s.id} onClick={() => go(`check/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><ListMusic size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-xs text-muted">{s.count} Tracks{s.origin ? ` · ${s.origin}` : ""}</span></span>
                <ArrowRight size={16} className="text-faint" />
              </button>
            ))}
          </Card>
        )}
      </div>
      {spotify && <SpotifyDialog asSet onClose={() => setSpotify(false)} onImported={(setId) => go(`check/${setId}`)} />}
    </div>
  );
}

function SourceCard({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action: React.ReactNode }) {
  return (
    <Card className="rise flex flex-col p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-hover">{icon}</div>
      <div className="font-semibold">{title}</div>
      <p className="mt-1 mb-5 flex-1 text-[13px] text-muted">{text}</p>
      <div>{action}</div>
    </Card>
  );
}

function CheckResult({ id }: { id: number }) {
  const { status, go, refreshSets, refreshTracks, refreshStatus, dataVersion, openTrack } = useStore();
  const run = useAction();
  const toast = useToast();
  const [curve, setCurve] = useState("free");
  const [focus, setFocus] = useState("balanced");
  const [orderBy, setOrderBy] = useState("");
  const [sort, setSort] = useState<{ key: "pos" | "bpm" | "key" | "energy" | "mood" | "family"; dir: 1 | -1 }>({ key: "pos", dir: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const [openTransition, setOpenTransition] = useState<number | null>(null);
  const [pinFirst, setPinFirst] = useState(false);
  const [pinLast, setPinLast] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [missing, setMissing] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(() => api.review(id, curve, pinFirst, pinLast, focus, orderBy).then(setReview).catch(() => setMissing(true)), [id, curve, pinFirst, pinLast, focus, orderBy]);
  useEffect(() => { load(); }, [load, dataVersion]);

  if (missing) return <Empty icon={<ScanSearch size={26} />} title="Playlist nicht gefunden" action={<Button onClick={() => go("check")}>Zurück</Button>} />;
  if (!review) return <div className="space-y-3 p-8">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-20" />)}</div>;

  const byId = new Map(review.tracks.map((t) => [t.id, t]));
  const after = review.order.map((tid) => byId.get(tid)!);
  const moved = new Set(review.moved);

  const applyRebuild = async () => {
    setApplying(true);
    const created = await run(() => api.applyOrder(id, review.order), "Umbau als neues Set gespeichert");
    setApplying(false);
    if (created) { await refreshSets(); go(`sets/${created.id}`); }
  };
  const refresh = async () => {
    setRefreshing(true);
    const r = await run(() => api.refreshSet(id));
    setRefreshing(false);
    if (!r) return;
    toast(changesText(r.changes));
    await Promise.all([refreshSets(), refreshTracks(), refreshStatus()]);
    load();
  };
  const applyFix = async (opt: FixOption) => {
    const items = review.tracks.map((t, i) => ({ track_id: t.id, pinned: review.pinned.includes(i) }));
    if (opt.kind === "swap") [items[opt.a!], items[opt.b!]] = [items[opt.b!], items[opt.a!]];
    if (opt.kind === "bridge") items.splice(opt.after! + 1, 0, { track_id: opt.track_id!, pinned: false });
    if (opt.kind === "remove") items.splice(opt.index!, 1);
    const ok = await run(() => api.updateSet(id, { items }), "Änderung übernommen");
    if (ok) { refreshSets(); load(); }
  };

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><IconButton label="Zurück" onClick={() => go("check")}><ArrowLeft size={18} /></IconButton>{review.name}</span>}
        subtitle={<span className="pl-10">Playlist-Check · {review.tracks.length} Tracks</span>}
      >
        {review.spotify_playlist_id && <Button icon={<RefreshCw size={16} />} loading={refreshing} onClick={refresh} title="Playlist in Spotify geändert? Hier neu laden und erneut prüfen.">Aus Spotify aktualisieren</Button>}
        <Button onClick={() => go(`sets/${id}`)}>Im Set-Builder öffnen</Button>
      </PageHeader>

      <div className="space-y-5 px-8 pb-12">
        {review.pending > 0 && (
          <div className="fade flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin text-accent" /> {review.pending} Tracks werden noch analysiert – die Bewertung aktualisiert sich automatisch.
          </div>
        )}

        <Card className="rise p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-4">
              <ScoreRing score={review.before.overall} color={verdictColor[review.before.verdict]} />
              <div>
                <div className="text-lg font-semibold">{review.before.grade}</div>
                <div className="mt-0.5 flex gap-3 text-[13px] text-muted">
                  {(["good", "ok", "bad"] as const).map((v) => (
                    <span key={v} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: verdictColor[v] }} /><b className="num font-semibold text-text">{review.before.counts[v]}</b>{v === "good" ? "gut" : v === "ok" ? "okay" : "kritisch"}</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="max-w-xl min-w-64 flex-1 text-muted">{review.summary}</p>
            {review.before.mood_score !== null && (
              <div className="text-right">
                <div className="text-xs text-muted">Stimmungsverlauf</div>
                <div className="num text-lg font-semibold" style={{ color: verdictColor[review.before.mood_score >= 0.72 ? "good" : review.before.mood_score >= 0.5 ? "ok" : "bad"] }}>{Math.round(review.before.mood_score * 100)}</div>
              </div>
            )}
          </div>
          <MoodBand moods={review.before.moods} tracks={review.tracks} onOpen={openTrack} />
        </Card>

        <section>
          <h2 className="mb-3 font-semibold">Auffälligkeiten <span className="num ml-1 text-[13px] font-normal text-muted">{review.findings.length}</span></h2>
          {review.findings.length === 0 ? (
            <Card className="flex items-center gap-2.5 px-4 py-3.5 text-[13px]"><CheckIcon size={16} className="text-good" /> Nichts Auffälliges: Tempo, Tonarten, Stimmung und Genres passen durchgehend.</Card>
          ) : (
            <Card className="divide-y divide-line/70 overflow-hidden">
              {review.findings.map((f, i) => (
                <button key={i} onClick={() => openTrack(f.track_ids[0])} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover" title="Track-Details öffnen">
                  <span className="mt-0.5 shrink-0" style={{ color: f.severity === "high" ? "var(--bad)" : f.severity === "medium" ? "var(--ok)" : "var(--faint)" }}>
                    {f.severity === "high" ? <CircleAlert size={16} /> : f.severity === "medium" ? <TriangleAlert size={16} /> : <Info size={16} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{f.title}</span><span className="block text-[13px] text-muted">{f.text}</span></span>
                  <span className="num shrink-0 text-xs text-faint">Platz {f.index + 1}</span>
                </button>
              ))}
            </Card>
          )}
        </section>

        <TrackTable review={review} sort={sort} setSort={setSort} onOpen={openTrack} onEnrich={async () => {
          const r = await run(() => api.enrich(review.tracks.map((t) => t.id)));
          if (r) { toast(r.queued ? `Schlage Daten für ${r.queued} Tracks nach` : "Für diese Tracks gibt es nichts nachzuschlagen"); refreshStatus(); }
        }} />

        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2 font-semibold"><Wand2 size={17} className="text-accent" /> Umbau-Vorschlag</div>
            <label className="flex items-center gap-2 text-[13px] text-muted">Reihenfolge
              <Select value={orderBy ? `sort:${orderBy}` : focus} onChange={(v) => { if (v.startsWith("sort:")) setOrderBy(v.slice(5)); else { setOrderBy(""); setFocus(v); } }}>
                <optgroup label="Optimieren">{Object.entries(review.focus_options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>
                <optgroup label="Fest sortieren">{Object.entries(review.order_options).map(([k, l]) => <option key={k} value={`sort:${k}`}>{l}</option>)}</optgroup>
              </Select>
            </label>
            <label className={cx("flex items-center gap-2 text-[13px] text-muted", orderBy && "pointer-events-none opacity-40")} title={orderBy ? "Bei fester Sortierung ohne Wirkung" : undefined}>Energiekurve
              <Select value={curve} onChange={setCurve}>{Object.entries(status?.curves ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </label>
            <Toggle checked={pinFirst} onChange={setPinFirst}>Erster Track bleibt</Toggle>
            <Toggle checked={pinLast} onChange={setPinLast}>Letzter Track bleibt</Toggle>
            <div className="ml-auto flex items-center gap-3">
              {review.recommend_rebuild && <span className="flex items-center gap-1.5 text-[13px] font-medium text-good"><TrendingUp size={15} /> {review.gain >= 0.005 ? `+${Math.round(review.gain * 100)} Punkte` : ""}{review.mood_gain >= 0.03 ? `${review.gain >= 0.005 ? " · " : ""}Stimmung +${Math.round(review.mood_gain * 100)}` : ""}</span>}
              <Button variant="primary" loading={applying} disabled={review.moved.length === 0} onClick={applyRebuild} title="Speichert die neue Reihenfolge als eigenes Set – das Original bleibt unverändert">Umbau als neues Set übernehmen</Button>
            </div>
          </div>
          {review.moved.length === 0 ? (
            <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-hover px-4 py-3 text-[13px]"><CheckIcon size={16} className="text-good" /> Mit diesen Vorgaben gibt es keine bessere Reihenfolge – die Playlist kann so bleiben.</div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <OrderColumn title="Vorher" rating={review.before} tracks={review.tracks} moved={moved} plans={review.plans_before} onOpen={setOpenTransition} />
              <OrderColumn title="Nachher" rating={review.after} tracks={after} moved={moved} plans={review.plans_after} highlight />
            </div>
          )}
        </Card>

        {openTransition !== null && <TransitionPanel setId={id} index={openTransition} total={review.tracks.length - 1} onClose={() => { setOpenTransition(null); load(); }} onNavigate={setOpenTransition} />}
        {review.fixes.length > 0 && (
          <section>
            <h2 className="mb-1 font-semibold">Einzelne Problemstellen</h2>
            <p className="mb-3 text-[13px] text-muted">Statt alles umzubauen, kannst du gezielt eingreifen. Änderungen wirken auf dieses Set in SetTracker – deine Spotify-Playlist bleibt unberührt.</p>
            <div className="space-y-3">
              {review.fixes.map((fix) => {
                const a = review.tracks[fix.index], b = review.tracks[fix.index + 1];
                const tr = review.before.transitions[fix.index];
                return (
                  <Card key={fix.index} className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <ScoreBadge score={tr.score} verdict={tr.verdict} />
                      <span className="font-medium">{fix.index + 1}. {a.title}</span>
                      <ArrowRight size={15} className="text-faint" />
                      <span className="font-medium">{fix.index + 2}. {b.title}</span>
                    </div>
                    <div className="mt-1.5 text-[13px] text-muted">{fix.issues.join(" · ")}</div>
                    {fix.options.length === 0 ? (
                      <div className="mt-3 text-[13px] text-faint">Kein einfacher Eingriff gefunden – der Umbau-Vorschlag oben löst die Stelle eher.</div>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2">
                        {fix.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg bg-hover px-3 py-2">
                            <span className="text-muted">{opt.kind === "swap" ? <ArrowRightLeft size={15} /> : opt.kind === "bridge" ? <ListMusic size={15} /> : <Wand2 size={15} />}</span>
                            <span className="min-w-0 flex-1 text-[13px]">{opt.text}</span>
                            <Button size="sm" onClick={() => applyFix(opt)}>Übernehmen</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Ein Farbsegment je Track nach Stimmung – zeigt Brüche im Verlauf auf einen Blick. */
function MoodBand({ moods, tracks, onOpen, compact }: { moods: string[]; tracks: Track[]; onOpen?: (id: number) => void; compact?: boolean }) {
  const used = [...new Set(moods.filter(Boolean))];
  if (!used.length) return null;
  return (
    <div className={compact ? "mt-1.5" : "mt-5"}>
      <div className={cx("flex gap-0.5 overflow-hidden rounded-full", compact ? "h-1.5" : "h-2.5")}>
        {moods.map((m, i) => (
          <button key={i} disabled={!onOpen} onClick={() => onOpen?.(tracks[i].id)} title={`${i + 1}. ${tracks[i].title} – ${m || "Stimmung unbekannt"}`}
            className="h-full flex-1 transition-opacity hover:opacity-70 disabled:cursor-default disabled:hover:opacity-100" style={{ background: moodColor(m) }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-medium text-text">Stimmung je Track</span>
          {used.map((m) => <span key={m} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: moodColor(m) }} />{m}</span>)}
        </div>
      )}
    </div>
  );
}

type SortState = { key: "pos" | "bpm" | "key" | "energy" | "mood" | "family"; dir: 1 | -1 };
const camelotRank = (c: string | null) => (c ? parseInt(c, 10) * 2 + (c.endsWith("B") ? 1 : 0) : 999);

/** Alle Tracks der Playlist mit ihren Daten – sortierbar, fehlende Werte markiert. */
function TrackTable({ review, sort, setSort, onOpen, onEnrich }: { review: Review; sort: SortState; setSort: (s: SortState) => void; onOpen: (id: number) => void; onEnrich: () => void }) {
  const rows = review.tracks.map((t, i) => ({ t, pos: i + 1 }));
  const value = (r: { t: Track; pos: number }): number | string => {
    switch (sort.key) {
      case "bpm": return r.t.bpm ?? (sort.dir === 1 ? 9999 : -1);
      case "key": return camelotRank(r.t.camelot);
      case "energy": return r.t.energy ?? (sort.dir === 1 ? 9 : -1);
      case "mood": return r.t.mood || "zzz";
      case "family": return r.t.family || "zzz";
      default: return r.pos;
    }
  };
  rows.sort((a, b) => { const va = value(a), vb = value(b); return (va < vb ? -1 : va > vb ? 1 : a.pos - b.pos) * sort.dir; });
  const missing = review.tracks.filter((t) => t.incomplete).length;
  const head = (key: SortState["key"], label: string, className?: string) => (
    <th className={cx("px-3 py-2 font-medium", className)}>
      <button className={cx("hover:text-text", sort.key === key && "text-accent")} onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Tracks und Daten</h2>
        <span className="text-[13px] text-muted">Spaltenkopf anklicken zum Sortieren (ändert nur diese Ansicht).</span>
        {missing > 0 && <Button size="sm" className="ml-auto" onClick={onEnrich}>{missing} unvollständig – Daten ergänzen</Button>}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead><tr className="border-b border-line text-xs text-muted">
            {head("pos", "Platz", "w-16")}<th className="px-3 py-2 font-medium">Titel</th>{head("bpm", "BPM", "text-right")}{head("key", "Tonart")}{head("energy", "Energie")}{head("mood", "Stimmung")}{head("family", "Genre")}<th className="px-3 py-2 font-medium">Quelle</th>
          </tr></thead>
          <tbody>
            {rows.map(({ t, pos }) => (
              <tr key={t.id} className="border-b border-line/60 last:border-0 hover:bg-hover/60">
                <td className="num px-3 py-1.5 font-semibold text-muted">{pos}</td>
                <td className="max-w-0 w-[32%] px-3 py-1.5"><button className="block max-w-full truncate text-left font-medium hover:text-accent" onClick={() => onOpen(t.id)} title="Details öffnen und Daten korrigieren">{t.title}</button><div className="truncate text-xs text-muted">{t.artist || "Unbekannt"}</div></td>
                <td className="num px-3 py-1.5 text-right font-mono">{t.bpm ? <>{t.bpm_hint && <span className="mr-1 text-ok" title={t.bpm_hint.text}>⚠</span>}{t.estimated ? "~" : ""}{fmtBpm(t.bpm)}</> : <Missing />}</td>
                <td className="px-3 py-1.5">{t.camelot ? <KeyBadge camelot={t.camelot} name={t.key_name} /> : <Missing />}</td>
                <td className="px-3 py-1.5">{t.energy !== null ? <span className="inline-flex items-center gap-2"><span className="h-1.5 w-12 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${t.energy * 100}%` }} /></span><span className="num text-xs text-muted">{Math.round(t.energy * 100)}</span></span> : <Missing />}</td>
                <td className="px-3 py-1.5">{t.mood ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: moodColor(t.mood) }} />{t.mood}</span> : <Missing />}</td>
                <td className="px-3 py-1.5">{t.family || <Missing />}</td>
                <td className="px-3 py-1.5 text-xs text-muted">{t.path ? "Datei (eigene Analyse)" : t.data_source || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function Missing() {
  return <span className="rounded bg-bad/15 px-1.5 py-0.5 text-[11px] font-medium text-bad">fehlt</span>;
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score)} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="num absolute inset-0 flex items-center justify-center text-xl font-semibold">{Math.round(score * 100)}</div>
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} aria-pressed={checked} className={cx("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors", checked ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised text-muted hover:text-text")}>
      <Pin size={14} />{children}
    </button>
  );
}

function OrderColumn({ title, rating, tracks, moved, highlight, plans, onOpen }: { title: string; rating: Rating; tracks: Track[]; moved: Set<number>; highlight?: boolean; plans: PlanBrief[]; onOpen?: (index: number) => void }) {
  return (
    <div className={cx("rounded-xl border p-3", highlight ? "border-accent/50 bg-accent-soft/40" : "border-line bg-bg")}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[13px] font-semibold">{title}</span>
        <ScoreBadge score={rating.overall} verdict={rating.verdict} />
      </div>
      <div className="mb-2 px-1"><EnergyChart energy={rating.energy} height={36} /><MoodBand moods={rating.moods} tracks={tracks} compact /></div>
      {tracks.map((t, i) => (
        <div key={t.id}>
          <div className={cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5", highlight && moved.has(t.id) && "bg-accent-soft")}>
            <span className="num w-5 text-center text-xs font-semibold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{t.title}</div>
              <div className="truncate text-xs text-muted">{t.artist || "Unbekannt"}</div>
            </div>
            {highlight && moved.has(t.id) && <span className="rounded bg-accent px-1.5 py-px text-[10px] font-semibold text-accent-fg">verschoben</span>}
            <span className="num w-11 text-right font-mono text-xs text-muted">{fmtBpm(t.bpm)}</span>
            <KeyBadge camelot={t.camelot} name={t.key_name} />
          </div>
          {i < tracks.length - 1 && rating.transitions[i] && (
            <button disabled={!onOpen} onClick={() => onOpen?.(i)} title={onOpen ? "Übergang mit Waveforms, Reglern und Anleitung öffnen" : plans[i]?.why}
              className={cx("ml-[18px] flex w-[calc(100%-18px)] items-start gap-2 rounded-md py-1 pr-1 text-left", onOpen && "hover:bg-hover")}>
              <span className="mt-0.5 h-8 w-0.5 shrink-0 rounded-full" style={{ background: verdictColor[rating.transitions[i].verdict] }} />
              <span className="num mt-0.5 w-6 shrink-0 text-[11px] font-semibold" style={{ color: verdictColor[rating.transitions[i].verdict] }}>{Math.round(rating.transitions[i].score * 100)}</span>
              <span className="min-w-0 flex-1">
                {plans[i] && <span className="block truncate text-[11px] font-medium text-text">{plans[i].title} · {plans[i].bars} Takt{plans[i].bars === 1 ? "" : "e"}{plans[i].out ? ` · raus bei ${plans[i].out} · rein bei ${plans[i].into}` : " · Zeiten nur mit Audiodatei"}</span>}
                <span className="block truncate text-[11px] text-faint">{(rating.transitions[i].verdict === "bad" ? rating.transitions[i].issues : rating.transitions[i].reasons).join(" · ")}</span>
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
