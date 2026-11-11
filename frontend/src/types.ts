export type Verdict = "good" | "ok" | "bad";

export interface Track {
  id: number;
  source: "local" | "spotify";
  path: string | null;
  spotify_id: string | null;
  title: string;
  artist: string;
  album: string;
  genres: string[];
  family: string;
  duration: number;
  bpm: number | null;
  camelot: string | null;
  key_name: string;
  energy: number | null;
  valence: number | null;
  mood: string;
  status: "pending" | "analyzing" | "done" | "error" | "partial";
  error: string | null;
  collections: string[];
  has_analysis: boolean;
  intro_bars?: number;
  outro_bars?: number;
}

export interface Part { score: number | null; text: string; label: string }
export interface Score {
  score: number;
  verdict: Verdict;
  parts: Record<string, Part>;
  reasons: string[];
  issues: string[];
  confidence: number;
}
export interface Transition extends Score { index: number; from_id: number; to_id: number }
export interface Rating {
  overall: number;
  verdict: Verdict;
  grade: string;
  transitions: Transition[];
  counts: Record<Verdict, number>;
  energy: number[];
  mood_score: number | null;
  moods: string[];
}
export interface SetView {
  id: number;
  name: string;
  curve: string;
  origin: string;
  items: { track: Track; pinned: boolean }[];
  rating: Rating;
  duration: number;
  targets: (number | null)[];
  spotify_playlist_id: string | null;
  files: { local: number; analyzed: number; total: number };
  before?: number;
  after?: number;
}
export interface SetInfo { id: number; name: string; count: number; origin: string; updated: number }
export interface Suggestion { track: Track; score: number; verdict: Verdict; reasons: string[] }

export interface Cue { pad: number; name: string; time: number; label: string }
export interface Step { when: string; deck: number | null; text: string; controls: string[]; bar_from: number | null; bar_to: number | null }
export interface Plan {
  template: string;
  title: string;
  suggested: string;
  why: string;
  precise: boolean;
  deck_a: number;
  deck_b: number;
  bars: number;
  tempo: { pct: number; target_bpm: number; factor: number; in_range: boolean } | null;
  mix_out?: { bar: number; time: number; label: string };
  mix_in?: { bar: number; time: number; label: string };
  cues_a: Cue[];
  cues_b: Cue[];
  steps: Step[];
}
export interface TransitionDetail { index: number; a: Track; b: Track; score: Score; plan: Plan }

export interface Section { kind: string; label: string; start: number; end: number; start_bar: number; end_bar: number }
export interface WaveData {
  duration: number;
  low: number[];
  mid: number[];
  high: number[];
  sections: Section[];
  first_downbeat: number | null;
  bar_len: number | null;
}

export interface FixOption {
  kind: "swap" | "bridge" | "remove";
  text: string;
  a?: number;
  b?: number;
  after?: number;
  index?: number;
  track_id?: number;
  track?: Track;
}
export interface Review {
  name: string;
  tracks: Track[];
  before: Rating;
  after: Rating;
  order: number[];
  moved: number[];
  gain: number;
  recommend_rebuild: boolean;
  summary: string;
  fixes: { index: number; issues: string[]; options: FixOption[] }[];
  pinned: number[];
  pending: number;
  findings: Finding[];
  mood_gain: number;
  spotify_playlist_id: string | null;
  focus_options: Record<string, string>;
}

export interface Status {
  desktop: boolean;
  analysis: { total: number; done: number; current: string; running: boolean };
  spotify: {
    configured: boolean;
    user: { name: string; id: string } | null;
    job: { running: boolean; phase: string; done: number; total: number; message: string };
    redirect_uri: string;
  };
  families: string[];
  curves: Record<string, string>;
  templates: Record<string, string>;
  weights: Record<string, number>;
}
export interface SpotifyPlaylist { id: string; name: string; count: number | null; image: string | null; owner: string | null }

export interface TrackCue { pad: number; letter: string; name: string; kind: "cue" | "loop"; time: number; end?: number; bars?: number; label: string; bar: number; estimated: boolean }
export interface Phase { name: string; kind: string; time: number; end: number; label: string; bar: number; bars: number }
export interface TrackDetail extends Track { cues: TrackCue[]; phases: Phase[] }
export interface SpotifyCheck { ok: boolean; redirect_uri: string; steps: { name: string; ok: boolean; detail: string; hint?: string }[] }

export interface Finding { kind: string; severity: "high" | "medium" | "info"; index: number; title: string; text: string; track_ids: number[] }
export interface Changes { added: number; removed: number; moved: boolean }

export interface Lesson { key: string; title: string; bars: number; bpm: number; steps: Step[]; difficulty: number; summary: string; when: string; listen: string; mistakes: string[] }
