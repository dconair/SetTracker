import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { controlValues } from "./LearnVisuals";
import type { Automation, Step } from "./types";

/** Eine Szene des Tutorials: erst ansagen, dann die Bewegung zeigen, dann kurz stehen lassen. */
export interface Scene {
  chapter: string;
  title: string;
  text: string;
  why?: string;
  /** Bedienelemente, auf die die Ansicht fährt und die hervorgehoben werden. */
  focus: string[];
  /** Taktposition in der Automation zu Beginn und Ende der Bewegung. */
  posFrom: number;
  posTo: number;
  /** Regler, die unabhängig von der Taktposition von einem Wert zum anderen fahren (z. B. Sprünge). */
  tween?: Record<string, [number, number]>;
  /** Start- und Zielstellung je Regler für die Bewegungs-Pfeile. */
  motion?: Record<string, { from: number; to: number }>;
  moveMs: number;
  stepIndex?: number;
}

export const SPEEDS: [number, string][] = [[0.6, "Langsam"], [1, "Normal"], [1.6, "Zügig"]];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Lesezeit vor und nach der Bewegung – längere Texte bleiben länger stehen. */
export function timing(scene: Scene) {
  const intro = clamp(1800 + scene.text.length * 38, 2600, 7500);
  const outro = scene.why ? clamp(1300 + scene.why.length * 30, 2000, 5200) : 1300;
  return { intro, move: scene.moveMs, outro, total: intro + scene.moveMs + outro };
}

/** Schritte eines Übergangs in Tutorial-Szenen übersetzen (Quelle: dieselbe Regler-Automation). */
export function scenesFromSteps(steps: Step[], automation: Automation): Scene[] {
  return steps.map((s, i) => {
    const moving = s.parts.filter((p) => !p.jump);
    const jumping = s.parts.filter((p) => p.jump);
    const prep = s.bar_from === null;
    const range = !prep && moving.length > 0;
    const posFrom = prep ? -0.5 : range ? s.bar_from! - 1 : s.bar_from! - 1 + 0.02;
    const posTo = range ? Math.min(s.bar_to ?? s.bar_from!, automation.bars) : posFrom;
    const tweened = prep ? s.parts : jumping;
    const bars = (s.bar_to ?? s.bar_from ?? 0) - (s.bar_from ?? 0) + 1;
    return {
      chapter: s.phase,
      title: s.when,
      text: s.text,
      why: s.why || undefined,
      focus: s.controls,
      posFrom,
      posTo,
      tween: tweened.length ? Object.fromEntries(tweened.map((p) => [p.control, [p.from, p.to] as [number, number]])) : undefined,
      motion: s.parts.length ? Object.fromEntries(s.parts.map((p) => [p.control, { from: p.from, to: p.to }])) : undefined,
      moveMs: range ? clamp(bars * 900, 3200, 7000) : s.parts.length ? 1400 : s.controls.length ? 1300 : 600,
      stepIndex: i,
    };
  });
}

/**
 * Spielt Szenen von selbst ab. Liefert die aktuelle Szene, ihre Phase und den Fortschritt der
 * Bewegung (0…1). Eigene Uhr über requestAnimationFrame: pausierbar und unabhängig vom Tempo-Regler.
 */
export function usePlayer(scenes: Scene[]) {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef({ index: 0, elapsed: 0, speed: 1, last: 0 });
  ref.current.speed = speed;

  const jump = useCallback((i: number, keepPlaying = true) => {
    const next = clamp(i, 0, scenes.length - 1);
    ref.current.index = next;
    ref.current.elapsed = 0;
    setIndex(next);
    setElapsed(0);
    setFinished(false);
    if (keepPlaying) setPlaying(true);
  }, [scenes.length]);

  useEffect(() => { ref.current.index = 0; ref.current.elapsed = 0; setIndex(0); setElapsed(0); setPlaying(false); setFinished(false); }, [scenes]);

  useEffect(() => {
    if (!playing || !scenes.length) return;
    let raf = 0;
    ref.current.last = performance.now();
    const tick = (now: number) => {
      const st = ref.current;
      const dt = Math.min(100, now - st.last);      // Tab im Hintergrund: nicht nachholen
      st.last = now;
      st.elapsed += dt * st.speed;
      const total = timing(scenes[st.index]).total;
      if (st.elapsed >= total) {
        if (st.index >= scenes.length - 1) { st.elapsed = total; setElapsed(total); setPlaying(false); setFinished(true); return; }
        st.index += 1;
        st.elapsed = 0;
        setIndex(st.index);
      }
      setElapsed(st.elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scenes]);

  const scene = scenes[index];
  const state = useMemo(() => {
    if (!scene) return { phase: "intro" as const, t: 0, progress: 0 };
    const tm = timing(scene);
    const phase = elapsed < tm.intro ? ("intro" as const) : elapsed < tm.intro + tm.move ? ("move" as const) : ("outro" as const);
    const t = phase === "intro" ? 0 : phase === "outro" ? 1 : ease((elapsed - tm.intro) / Math.max(tm.move, 1));
    return { phase, t, progress: clamp(elapsed / tm.total, 0, 1) };
  }, [scene, elapsed]);

  return {
    index, scene, ...state, playing, finished, speed, setSpeed,
    play: () => { if (finished) jump(0); else setPlaying(true); },
    pause: () => setPlaying(false),
    toggle: () => { if (finished) jump(0); else setPlaying((p) => !p); },
    go: jump,
    restart: () => jump(0),
  };
}

/** Reglerstellungen und Taktposition für den aktuellen Moment einer Szene. */
export function sceneState(scene: Scene | undefined, t: number, automation: Automation) {
  if (!scene) return { pos: -0.5, values: controlValues(automation, -0.5) };
  const pos = scene.posFrom + (scene.posTo - scene.posFrom) * t;
  const values = controlValues(automation, pos);
  for (const [id, [v0, v1]] of Object.entries(scene.tween ?? {})) values[id] = v0 + (v1 - v0) * t;
  return { pos, values };
}
