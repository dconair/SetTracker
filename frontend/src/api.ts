import type { Changes, SpotifyCheck, TrackDetail, Review, SetInfo, SetView, SpotifyPlaylist, Status, Suggestion, Track, TransitionDetail, WaveData } from "./types";

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      /* Antwort ohne JSON */
    }
    throw new Error(message);
  }
  return res.json();
}

const q = (params: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const text = s.toString();
  return text ? `?${text}` : "";
};

export const api = {
  status: () => call<Status>("GET", "/api/status"),
  tracks: () => call<Track[]>("GET", "/api/tracks"),
  track: (id: number) => call<TrackDetail>("GET", `/api/tracks/${id}`),
  spotifyCheck: () => call<SpotifyCheck>("GET", "/api/spotify/check"),
  waveform: (id: number) => call<WaveData>("GET", `/api/tracks/${id}/waveform`),
  patchTrack: (id: number, body: Partial<Pick<Track, "family" | "bpm" | "camelot">>) => call<Track>("PATCH", `/api/tracks/${id}`, body),
  bulk: (ids: number[], body: { family?: string; delete?: boolean }) => call("POST", "/api/tracks/bulk", { ids, ...body }),
  scan: (path: string) => call<{ found: number; added: number; linked: number }>("POST", "/api/library/scan", { path }),
  demo: () => call<{ found: number }>("POST", "/api/library/demo"),
  fillGenres: () => call<{ queued: number }>("POST", "/api/library/genres"),
  fs: (path: string) => call<{ path: string; parent: string | null; dirs: string[]; audio_files: number }>("GET", `/api/fs${q({ path })}`),

  spotifyLogin: () => call<{ url: string }>("GET", "/api/spotify/login"),
  spotifyCredentials: (client_id: string, client_secret: string) => call("POST", "/api/spotify/credentials", { client_id, client_secret }),
  quit: () => call("POST", "/api/quit", { confirm: true }),
  openExternal: (url: string) => call("POST", "/api/open-external", { url }),
  spotifyLogout: () => call("POST", "/api/spotify/logout"),
  spotifyPlaylists: () => call<SpotifyPlaylist[]>("GET", "/api/spotify/playlists"),
  spotifyImport: (body: { playlist_id?: string; liked?: boolean; as_set?: boolean }) =>
    call<{ name: string; count: number; set_id?: number; changes?: Changes }>("POST", "/api/spotify/import", body),
  addSpotifyTrack: (t: Track) =>
    call<Track>("POST", "/api/tracks/spotify", { spotify_id: t.spotify_id, title: t.title, artist: t.artist, duration: t.duration }),

  sets: () => call<SetInfo[]>("GET", "/api/sets"),
  createSet: (name: string, track_ids: number[] = []) => call<SetView>("POST", "/api/sets", { name, track_ids }),
  set: (id: number) => call<SetView>("GET", `/api/sets/${id}`),
  updateSet: (id: number, body: { name?: string; curve?: string; items?: { track_id: number; pinned: boolean }[] }) =>
    call<SetView>("PUT", `/api/sets/${id}`, body),
  deleteSet: (id: number) => call("DELETE", `/api/sets/${id}`),
  autosort: (id: number) => call<SetView>("POST", `/api/sets/${id}/autosort`),
  suggest: (id: number, position: number | null, family: string) =>
    call<Suggestion[]>("GET", `/api/sets/${id}/suggest${q({ position, family })}`),
  discover: (id: number) => call<Suggestion[]>("GET", `/api/sets/${id}/discover`),
  transition: (id: number, index: number, template?: string) =>
    call<TransitionDetail>("GET", `/api/sets/${id}/transition/${index}${q({ template })}`),
  review: (id: number, curve: string, pin_first: boolean, pin_last: boolean, focus: string) =>
    call<Review>("GET", `/api/sets/${id}/review${q({ curve, pin_first, pin_last, focus })}`),
  refreshSet: (id: number) => call<{ changes: Changes; set: SetView }>("POST", `/api/sets/${id}/refresh`),
  linkCandidates: (id: number) => call<Track[]>("GET", `/api/tracks/${id}/link-candidates`),
  linkTrack: (id: number, other_id: number) => call<Track>("POST", `/api/tracks/${id}/link`, { other_id }),
  unlinkTrack: (id: number) => call<{ file_id: number }>("POST", `/api/tracks/${id}/unlink`),
  applyOrder: (id: number, order: number[]) => call<SetView>("POST", `/api/sets/${id}/apply`, { order }),
  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<{ set_ids: number[]; missing: number }>("POST", "/api/import/file", form);
  },
  exportSpotify: (id: number) => call<{ url: string; added: number; missing: string[] }>("POST", `/api/sets/${id}/export/spotify`),
};

/** Öffnet eine Adresse im Browser. Im Programmfenster übernimmt das der Server, weil das
 *  eingebettete Fenster neue Browserfenster blockieren kann. */
export async function openExternal(url: string, desktop: boolean | undefined): Promise<void> {
  if (desktop) await api.openExternal(url);
  else window.open(url, "_blank");
}
