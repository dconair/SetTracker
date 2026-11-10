import { useEffect, useRef } from "react";
import type { WaveData } from "./types";

export interface Marker { time: number; label: string; color: string }

interface Props {
  data: WaveData;
  /** Sichtbarer Ausschnitt in Sekunden (Standard: ganzer Track). Darf über den Track hinausragen. */
  start?: number;
  end?: number;
  height?: number;
  markers?: Marker[];
  /** Hervorgehobener Bereich, z. B. der Überblend-Abschnitt. */
  highlight?: { start: number; end: number };
  showSections?: boolean;
  showBars?: boolean;
}

const SECTION_TINT: Record<string, number> = { intro: 0.1, outro: 0.1, break: 0.06, main: 0 };

/** Dreiband-Waveform (Bass blau, Mitten orange, Höhen hell) mit Abschnitten und Marken. */
export function Waveform({ data, start = 0, end, height = 96, markers = [], highlight, showSections = true, showBars }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const to = end ?? data.duration;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const css = getComputedStyle(document.documentElement);
      const color = (name: string) => css.getPropertyValue(name).trim();
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (!width) return;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      const x = (t: number) => ((t - start) / (to - start)) * width;
      const labelSpace = showSections ? 16 : 0;
      const mid = labelSpace + (height - labelSpace) / 2;
      const amp = (height - labelSpace) / 2 - 2;

      if (showSections) {
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        for (const s of data.sections) {
          const x0 = Math.max(0, x(s.start));
          const x1 = Math.min(width, x(s.end));
          if (x1 <= 0 || x0 >= width) continue;
          const tint = SECTION_TINT[s.kind] ?? 0;
          if (tint) {
            ctx.fillStyle = color("--muted");
            ctx.globalAlpha = tint;
            ctx.fillRect(x0, labelSpace, x1 - x0, height - labelSpace);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = color("--faint");
          if (x1 - x0 > 34) ctx.fillText(s.label.toUpperCase(), x0 + 4, 10);
          ctx.fillStyle = color("--line");
          ctx.fillRect(x0, 0, 1, height);
        }
      }
      if (highlight) {
        ctx.fillStyle = color("--accent");
        ctx.globalAlpha = 0.13;
        ctx.fillRect(x(highlight.start), labelSpace, x(highlight.end) - x(highlight.start), height - labelSpace);
        ctx.globalAlpha = 1;
      }
      if (showBars && data.bar_len && data.first_downbeat !== null) {
        ctx.fillStyle = color("--line");
        const first = Math.ceil((start - data.first_downbeat) / data.bar_len);
        for (let b = first; data.first_downbeat + b * data.bar_len < to; b++) {
          if (b % 4 === 0) ctx.fillRect(x(data.first_downbeat + b * data.bar_len), labelSpace, 1, height - labelSpace);
        }
      }

      const n = data.low.length;
      const bands: [number[], string, number][] = [
        [data.low, color("--wave-low"), 1],
        [data.mid, color("--wave-mid"), 0.85],
        [data.high, color("--wave-high"), 0.8],
      ];
      for (const [values, fill, scale] of bands) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        for (let px = 0; px < width; px++) {
          const t = start + (px / width) * (to - start);
          if (t < 0 || t >= data.duration) continue;
          const i0 = Math.floor((t / data.duration) * n);
          const i1 = Math.max(i0 + 1, Math.floor(((t + (to - start) / width) / data.duration) * n));
          let v = 0;
          for (let i = i0; i < i1 && i < n; i++) v = Math.max(v, values[i]);
          const h = Math.max(0.5, (v / 255) * amp * scale);
          ctx.rect(px, mid - h, 1, h * 2);
        }
        ctx.fill();
      }

      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      for (const m of markers) {
        const mx = x(m.time);
        if (mx < 0 || mx > width) continue;
        ctx.fillStyle = m.color;
        ctx.fillRect(mx - 1, labelSpace, 2, height - labelSpace);
        const w = ctx.measureText(m.label).width + 10;
        const lx = Math.min(mx - 1, width - w);
        ctx.beginPath();
        ctx.roundRect(lx, height - 17, w, 15, 4);
        ctx.fill();
        ctx.fillStyle = "#0a0c10";
        ctx.fillText(m.label, lx + 5, height - 6);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [data, start, to, height, markers, highlight, showSections, showBars]);

  return <canvas ref={ref} className="block w-full" style={{ height }} />;
}
