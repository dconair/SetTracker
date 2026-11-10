import { AudioWaveform, Library as LibraryIcon, ListMusic, Loader2, Moon, ScanSearch, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { cx, ToastProvider } from "./ui";
import { Check } from "./views/Check";
import { Library } from "./views/Library";
import { SetBuilder, SetList } from "./views/SetBuilder";

const NAV: { path: string; label: string; icon: ReactNode }[] = [
  { path: "bibliothek", label: "Bibliothek", icon: <LibraryIcon size={18} /> },
  { path: "sets", label: "Sets", icon: <ListMusic size={18} /> },
  { path: "check", label: "Playlist-Check", icon: <ScanSearch size={18} /> },
];

function Shell() {
  const { route, go, status } = useStore();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  const page = route[0] || "bibliothek";
  const analysis = status?.analysis;
  const job = status?.spotify.job;

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
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-hover hover:text-text lg:justify-start"
            title="Hell/Dunkel umschalten"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span className="hidden lg:block">{theme === "dark" ? "Heller Modus" : "Dunkler Modus"}</span>
          </button>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {page === "bibliothek" && <Library />}
        {page === "sets" && (route[1] ? <SetBuilder key={route[1]} id={Number(route[1])} /> : <SetList />)}
        {page === "check" && <Check id={route[1] ? Number(route[1]) : null} key={route[1] ?? "start"} />}
      </main>
    </div>
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
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ToastProvider>
  );
}
