import { useCallback, useEffect, useState } from "react";

export interface ThemeDef { id: string; name: string; mode: "dark" | "light"; hint: string; swatch: [string, string, string] }
export const THEMES: ThemeDef[] = [
  { id: "studio", name: "Studio", mode: "dark", hint: "Neutrales Dunkel", swatch: ["#0a0c10", "#171b23", "#e9ecf2"] },
  { id: "mitternacht", name: "Mitternacht", mode: "dark", hint: "Tiefes Blau", swatch: ["#0a0e1d", "#17203f", "#e8ebf7"] },
  { id: "club", name: "Club", mode: "dark", hint: "Reines Schwarz, hoher Kontrast", swatch: ["#000000", "#131313", "#f6f6f6"] },
  { id: "vinyl", name: "Vinyl", mode: "dark", hint: "Warmes Dunkel", swatch: ["#12100d", "#231f19", "#f2ece3"] },
  { id: "papier", name: "Papier", mode: "light", hint: "Klares Hell", swatch: ["#f4f5f8", "#ffffff", "#12151b"] },
  { id: "sand", name: "Sand", mode: "light", hint: "Warmes Hell", swatch: ["#f5f0e6", "#fffdf8", "#1d1914"] },
];

/** Akzentfarben: je ein Ton für dunkle und einer mit genug Kontrast für helle Designs. */
export const ACCENTS: { id: string; name: string; dark: string; light: string }[] = [
  { id: "blau", name: "Blau", dark: "#6c8cff", light: "#3d5eea" },
  { id: "violett", name: "Violett", dark: "#a78bfa", light: "#7445d6" },
  { id: "pink", name: "Pink", dark: "#f472b6", light: "#c9277a" },
  { id: "orange", name: "Orange", dark: "#ff9a4d", light: "#c2570a" },
  { id: "tuerkis", name: "Türkis", dark: "#2dd4d4", light: "#0b848b" },
  { id: "limette", name: "Limette", dark: "#b6e04a", light: "#557d08" },
];

export const WAVES: { id: string; name: string; colors: [string, string] | null }[] = [
  { id: "klassisch", name: "Klassisch", colors: ["#4d8dff", "#ffa23e"] },
  { id: "neon", name: "Neon", colors: ["#d946ef", "#22d3ee"] },
  { id: "glut", name: "Glut", colors: ["#ef4444", "#fbbf24"] },
  { id: "mono", name: "Einfarbig", colors: null },
];

export interface Appearance { theme: string; accent: string; wave: string }
const DEFAULT: Appearance = { theme: "studio", accent: "blau", wave: "klassisch" };
const KEY = "settracker-appearance";

function load(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) return { ...DEFAULT, ...saved };
    if (localStorage.getItem("theme") === "light") return { ...DEFAULT, theme: "papier" };  // frühere Einstellung
  } catch {
    /* Speicher nicht verfügbar */
  }
  return DEFAULT;
}

export function applyAppearance(a: Appearance) {
  const theme = THEMES.find((t) => t.id === a.theme) ?? THEMES[0];
  const accent = ACCENTS.find((c) => c.id === a.accent) ?? ACCENTS[0];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.dataset.wave = WAVES.some((w) => w.id === a.wave) ? a.wave : "klassisch";
  root.style.setProperty("--accent", theme.mode === "light" ? accent.light : accent.dark);
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(load);
  useEffect(() => {
    applyAppearance(appearance);
    try {
      localStorage.setItem(KEY, JSON.stringify(appearance));
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [appearance]);
  const update = useCallback((patch: Partial<Appearance>) => setAppearance((a) => ({ ...a, ...patch })), []);
  return { appearance, update };
}
