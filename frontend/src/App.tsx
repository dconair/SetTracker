import { AudioWaveform, GraduationCap, Library as LibraryIcon, ListMusic, Check as CheckIcon, Loader2, Palette, Power, ScanSearch } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "./api";
import { StoreProvider, useStore } from "./store";
import { ACCENTS, THEMES, useAppearance, WAVES, type Appearance } from "./theme";
import { cx, DialogProvider, Modal, ToastProvider, useDialog } from "./ui";
import { Check } from "./views/Check";
import { Learn } from "./views/Learn";
import { Library } from "./views/Library";
import { TrackPanel } from "./views/TrackPanel";
import { SetBuilder, SetList } from "./views/SetBuilder";

const NAV: { path: string; label: string; icon: ReactNode }[] = [
  { path: "bibliothek", label: "Bibliothek", icon: <LibraryIcon size={18} /> },
  { path: "sets", label: "Sets", icon: <ListMusic size={18} /> },
  { path: "check", label: "Playlist-Check", icon: <ScanSearch size={18} /> },
  { path: "lernen", label: "Lernen", icon: <GraduationCap size={18} /> },
];

function Shell() {
  const { route, go, status, detailId, openTrack } = useStore();
  const { appearance, update } = useAppearance();
  const [showAppearance, setShowAppearance] = useState(false);
  const dialog = useDialog();
  const [stopped, setStopped] = useState(false);
  const quit = async () => {
    if (!(await dialog.confirm("SetTracker beenden?", "Laufende Analysen werden abgebrochen und beim nächsten Start fortgesetzt.", { action: "Beenden" }))) return;
    await api.quit().catch(() => {});
    setStopped(true);
  };
  const page = route[0] || "bibliothek";
  const analysis = status?.analysis;
  const job = status?.spotify.job;

  if (stopped)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Power size={26} /></div>
        <h1 className="text-lg font-semibold">SetTracker wurde beendet</h1>
        <p className="max-w-sm text-muted">Du kannst diesen Tab schließen. Zum Weiterarbeiten SetTracker einfach wieder starten.</p>
      </div>
    );

  return (
    <div className="flex h-full">
      <nav className="flex w-16 shrink-0 flex-col border-r border-line bg-surface lg:w-56">
        <div className="flex h-16 items-center gap-2.5 px-4 lg:px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <AudioWaveform size={18} strokeWidth={2.4} />
          </div>
          <span className="hidden text-[15px] font-semibold tracking-tight lg:block">SetTracker</span>
        </div>
        <div className="flex flex-col gap-1 px-2.5 pt-2">
          {NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => go(item.path)}
              title={item.label}
              aria-current={page === item.path ? "page" : undefined}
              className={cx(
                "flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:justify-start",
                page === item.path ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-text",
              )}
            >
              {item.icon}
              <span className="hidden lg:block">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 p-2.5">
          {(analysis?.running || job?.running) && (
            <div className="fade rounded-lg border border-line bg-raised p-2.5 lg:p-3" title={analysis?.running ? `Analysiere ${analysis.current}` : job?.phase}>
              <div className="flex items-center justify-center gap-2 text-xs font-medium lg:justify-start">
                <Loader2 size={14} className="shrink-0 animate-spin text-accent" />
                <span className="hidden truncate lg:block">{analysis?.running ? "Analysiere Audio" : job?.phase}</span>
              </div>
              <div className="mt-2 hidden lg:block">
                <Progress done={analysis?.running ? analysis.done : job?.done ?? 0} total={analysis?.running ? analysis.total : job?.total ?? 0} />
                <div className="mt-1.5 truncate text-[11px] text-muted">{analysis?.running ? analysis.current : job?.message}</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowAppearance(true)}
            className="flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-hover hover:text-text lg:justify-start"
            title="Design und Farben anpassen"
          >
            <Palette size={18} />
            <span className="hidden lg:block">Darstellung</span>
          </button>
{!status?.desktop && (
          <button
            onClick={quit}
            className="flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-hover hover:text-text lg:justify-start"
            title="SetTracker beenden"
          >
            <Power size={18} />
            <span className="hidden lg:block">Beenden</span>
          </button>
          )}
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {page === "bibliothek" && <Library />}
        {page === "sets" && (route[1] ? <SetBuilder key={route[1]} id={Number(route[1])} /> : <SetList />)}
        {page === "lernen" && <Learn />}
        {page === "check" && <Check id={route[1] ? Number(route[1]) : null} key={route[1] ?? "start"} />}
      </main>
      {detailId !== null && <TrackPanel id={detailId} onClose={() => openTrack(null)} />}
      {showAppearance && <AppearanceDialog appearance={appearance} update={update} onClose={() => setShowAppearance(false)} />}
    </div>
  );
}

function AppearanceDialog({ appearance, update, onClose }: { appearance: Appearance; update: (p: Partial<Appearance>) => void; onClose: () => void }) {
  const mode = THEMES.find((t) => t.id === appearance.theme)?.mode ?? "dark";
  const accent = ACCENTS.find((a) => a.id === appearance.accent) ?? ACCENTS[0];
  const heading = "mb-2.5 text-xs font-medium tracking-wide text-muted uppercase";
  return (
    <Modal title="Darstellung" onClose={onClose} wide>
      <div className={heading}>Design</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Design">
        {THEMES.map((t) => {
          const active = appearance.theme === t.id;
          return (
            <button key={t.id} role="radio" aria-checked={active} onClick={() => update({ theme: t.id })}
              className={cx("rounded-xl border p-2 text-left transition-colors", active ? "border-accent bg-accent-soft" : "border-line hover:bg-hover")}>
              <div className="flex h-16 flex-col justify-between rounded-lg p-2" style={{ background: t.swatch[0], border: "1px solid rgb(128 128 128 / 0.25)" }}>
                <div className="h-2 w-10 rounded-full" style={{ background: t.swatch[2], opacity: 0.9 }} />
                <div className="flex items-end gap-1.5">
                  <div className="h-6 flex-1 rounded-md" style={{ background: t.swatch[1], border: "1px solid rgb(128 128 128 / 0.2)" }} />
                  <div className="h-3 w-7 rounded-full" style={{ background: t.mode === "light" ? accent.light : accent.dark }} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between px-0.5">
                <span className="text-[13px] font-medium">{t.name}</span>
                {active && <CheckIcon size={14} className="text-accent" />}
              </div>
              <div className="px-0.5 text-xs text-muted">{t.hint}</div>
            </button>
          );
        })}
      </div>

      <div className={cx(heading, "mt-6")}>Akzentfarbe</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Akzentfarbe">
        {ACCENTS.map((a) => {
          const active = appearance.accent === a.id;
          return (
            <button key={a.id} role="radio" aria-checked={active} onClick={() => update({ accent: a.id })}
              className={cx("flex h-9 items-center gap-2 rounded-full border pr-3.5 pl-2 text-[13px] font-medium transition-colors", active ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:bg-hover hover:text-text")}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: mode === "light" ? a.light : a.dark }}>
                {active && <CheckIcon size={12} strokeWidth={3} color={mode === "light" ? "#fff" : "#0a0c10"} />}
              </span>
              {a.name}
            </button>
          );
        })}
      </div>

      <div className={cx(heading, "mt-6")}>Waveform-Farben</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="radiogroup" aria-label="Waveform-Farben">
        {WAVES.map((w) => {
          const active = appearance.wave === w.id;
          const [low, mid] = w.colors ?? ["var(--accent)", "var(--muted)"];
          return (
            <button key={w.id} role="radio" aria-checked={active} onClick={() => update({ wave: w.id })}
              className={cx("rounded-xl border p-2.5 text-left transition-colors", active ? "border-accent bg-accent-soft" : "border-line hover:bg-hover")}>
              <div className="flex h-9 items-center gap-[3px]">
                {[5, 9, 4, 8, 6, 9, 3, 7, 5, 8, 4, 6].map((h, i) => (
                  <span key={i} className="relative flex-1 rounded-full" style={{ height: h * 4, background: low }}>
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: h * 2, background: mid }} />
                    <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: "var(--wave-high)" }} />
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px] font-medium">{w.name}{active && <CheckIcon size={14} className="text-accent" />}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-5 text-xs text-faint">Die Einstellungen werden in diesem Browser gespeichert und gelten sofort.</p>
    </Modal>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="num text-[11px] text-muted">{done}/{total}</span>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <DialogProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </DialogProvider>
    </ToastProvider>
  );
}
