import { Check, Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Track, Verdict } from "./types";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const fmtTime = (s: number) => {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
export const fmtLong = (s: number) => {
  const min = Math.round(s / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};
export const fmtBpm = (bpm: number | null) => (bpm ? (Math.round(bpm * 10) / 10).toString() : "–");
export const verdictColor: Record<Verdict, string> = { good: "var(--good)", ok: "var(--ok)", bad: "var(--bad)" };
export const verdictLabel: Record<Verdict, string> = { good: "passt gut", ok: "okay", bad: "kritisch" };

// ---------------------------------------------------------------- Buttons
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
  loading?: boolean;
};
export function Button({ variant = "secondary", size = "md", icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "secondary" && "border border-line bg-raised text-text hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-text",
        variant === "danger" && "border border-line bg-raised text-bad hover:bg-hover",
        className,
      )}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover hover:text-text",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Badges
/** Tonart als farbige Camelot-Marke: Farbton = Position auf dem Rad. */
export function KeyBadge({ camelot, name }: { camelot: string | null; name?: string }) {
  if (!camelot) return <span className="text-faint">–</span>;
  const num = parseInt(camelot, 10);
  const minor = camelot.endsWith("A");
  const hue = ((num - 1) * 30 + 200) % 360;
  return (
    <span
      title={name ? `${camelot} · ${name}` : camelot}
      className="num inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 font-mono text-xs font-semibold"
      style={{
        background: `hsl(${hue} 70% 55% / ${minor ? 0.16 : 0.26})`,
        color: `hsl(${hue} 80% var(--key-l, 72%))`,
      }}
    >
      {camelot}
    </span>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
        active ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:bg-hover hover:text-text",
      )}
    >
      {children}
      {count !== undefined && <span className={cx("num text-xs", active ? "opacity-80" : "text-faint")}>{count}</span>}
    </button>
  );
}

export function Meter({ value, color = "var(--accent)" }: { value: number | null; color?: string }) {
  if (value === null) return <span className="text-faint">–</span>;
  return (
    <span className="inline-flex items-center gap-2" title={`${Math.round(value * 100)} %`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </span>
    </span>
  );
}

export function ScoreBadge({ score, verdict, size = "md" }: { score: number; verdict: Verdict; size?: "md" | "lg" }) {
  return (
    <span
      className={cx("num inline-flex items-center gap-1.5 rounded-full font-semibold", size === "lg" ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs")}
      style={{ color: verdictColor[verdict], background: `color-mix(in srgb, ${verdictColor[verdict]} 14%, transparent)` }}
      title={verdictLabel[verdict]}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: verdictColor[verdict] }} />
      {Math.round(score * 100)}
    </span>
  );
}

export function SourceTag({ track }: { track: Track }) {
  if (track.source === "local")
    return <span className="rounded bg-hover px-1.5 py-0.5 text-[11px] font-medium text-muted" title="Lokale Datei – volle Analyse mit Waveform">Datei{track.spotify_id ? " + Spotify" : ""}</span>;
  return <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: "#1ed760", background: "rgb(30 215 96 / 0.12)" }} title="Nur bei Spotify – ohne Waveform">Spotify</span>;
}

export function TrackTitle({ track, compact, onOpen }: { track: Track; compact?: boolean; onOpen?: () => void }) {
  const title = <div className={cx("truncate font-medium", compact && "text-[13px]")}>{track.title}</div>;
  return (
    <div className="min-w-0">
      {onOpen ? <button onClick={onOpen} className="block max-w-full text-left hover:text-accent" title="Details, Hot Cues und Phasen anzeigen">{title}</button> : title}
      <div className={cx("truncate text-muted", compact ? "text-xs" : "text-[13px]")}>{track.artist || "Unbekannter Künstler"}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Layout-Bausteine
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rise mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-2 text-muted">{children}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function Modal({ title, onClose, children, wide, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fade fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx("rise flex max-h-[88vh] w-full flex-col rounded-2xl border border-line bg-surface", wide ? "max-w-2xl" : "max-w-md")} style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Schließen" onClick={onClose}><X size={17} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Kleines Aufklappmenü, schließt bei Klick außerhalb. */
export function Menu({ trigger, children, align = "right" }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cx("fade absolute z-30 mt-1.5 max-h-80 min-w-52 overflow-y-auto rounded-xl border border-line bg-raised p-1.5", align === "right" ? "right-0" : "left-0")} style={{ boxShadow: "var(--shadow)" }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, icon, danger }: { onClick: () => void; children: ReactNode; icon?: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hover", danger ? "text-bad" : "text-text")}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export const inputClass =
  "h-9 rounded-lg border border-line bg-raised px-3 text-sm text-text placeholder:text-faint outline-none transition-colors focus:border-accent";

export function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputClass, "cursor-pointer pr-8", className)}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------- Hinweise (Toasts)
type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastContext = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="rise pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border border-line bg-raised px-4 py-3 text-[13px]" style={{ boxShadow: "var(--shadow)" }}>
            <span className="mt-0.5" style={{ color: t.kind === "error" ? "var(--bad)" : "var(--good)" }}>
              {t.kind === "error" ? <X size={15} /> : <Check size={15} />}
            </span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Führt eine Aktion aus und meldet Fehler als Hinweis. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (success) toast(success);
        return result;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Unbekannter Fehler", "error");
        return undefined;
      }
    },
    [toast],
  );
}

import type { Changes } from "./types";

export const changesText = (c: Changes) => {
  const parts = [c.added && `${c.added} neu`, c.removed && `${c.removed} entfernt`, c.moved && "Reihenfolge geändert"].filter(Boolean);
  return parts.length ? `Aus Spotify aktualisiert: ${parts.join(", ")}` : "Keine Änderungen in Spotify";
};

/** Farbe je Stimmung – für das Stimmungs-Band im Playlist-Check. */
export const moodColor = (mood: string) =>
  ({ Euphorisch: "#ffb84d", "Treibend & dunkel": "#f2617a", Groovig: "#3ecf8e", "Deep & hypnotisch": "#6c8cff", Entspannt: "#5fd4d4", Melancholisch: "#a78bfa" } as Record<string, string>)[mood] ?? "var(--line)";

// ---------------------------------------------------------------- Dialoge (statt window.prompt/confirm)
interface DialogRequest {
  kind: "prompt" | "confirm";
  title: string;
  text?: string;
  value?: string;
  action?: string;
  danger?: boolean;
  resolve: (result: string | boolean | null) => void;
}
interface DialogApi {
  /** Texteingabe; liefert null bei Abbruch. */
  ask: (title: string, initial?: string, action?: string) => Promise<string | null>;
  /** Rückfrage; liefert true bei Bestätigung. */
  confirm: (title: string, text?: string, options?: { action?: string; danger?: boolean }) => Promise<boolean>;
}
const DialogContext = createContext<DialogApi>(null as unknown as DialogApi);
export const useDialog = () => useContext(DialogContext);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const api = useRef<DialogApi>({
    ask: (title, initial = "", action = "Anlegen") =>
      new Promise((resolve) => { setValue(initial); setRequest({ kind: "prompt", title, action, resolve: (r) => resolve(r as string | null) }); }),
    confirm: (title, text, options = {}) =>
      new Promise((resolve) => setRequest({ kind: "confirm", title, text, action: options.action ?? "OK", danger: options.danger, resolve: (r) => resolve(r === true) })),
  });
  const close = (result: string | boolean | null) => { request?.resolve(result); setRequest(null); };
  const submit = () => {
    if (!request) return;
    if (request.kind === "confirm") close(true);
    else if (value.trim()) close(value.trim());
  };
  return (
    <DialogContext.Provider value={api.current}>
      {children}
      {request && (
        <Modal title={request.title} onClose={() => close(request.kind === "confirm" ? false : null)} footer={<>
          <Button variant="ghost" onClick={() => close(request.kind === "confirm" ? false : null)}>Abbrechen</Button>
          <Button variant={request.danger ? "danger" : "primary"} onClick={submit} disabled={request.kind === "prompt" && !value.trim()} autoFocus={request.kind === "confirm"}>{request.action}</Button>
        </>}>
          {request.kind === "prompt" ? (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
              <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} className={cx(inputClass, "w-full")} aria-label={request.title} />
            </form>
          ) : (
            <p className="text-muted">{request.text}</p>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
