import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { SetInfo, Status, Track } from "./types";

interface Store {
  status: Status | null;
  tracks: Track[] | null;
  sets: SetInfo[];
  refreshTracks: () => Promise<void>;
  refreshSets: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  /** Zählt hoch, sobald im Hintergrund neue Analysedaten eingetroffen sind. */
  dataVersion: number;
  playing: number | null;
  togglePlay: (track: Track) => void;
  route: string[];
  go: (path: string) => void;
  /** Öffnet die Track-Details (Waveform, Hot Cues, Phasen). */
  openTrack: (id: number | null) => void;
  detailId: number | null;
}

const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

const parseRoute = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  const [route, setRoute] = useState(parseRoute);
  const [detailId, openTrack] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const busy = useRef(false);

  const refreshTracks = useCallback(async () => setTracks(await api.tracks()), []);
  const refreshSets = useCallback(async () => setSets(await api.sets()), []);
  const refreshStatus = useCallback(async () => {
    const s = await api.status();
    setStatus(s);
    const nowBusy = s.analysis.running || s.spotify.job.running;
    // Während Hintergrundarbeit laufend nachladen, danach einmal abschließend.
    if (nowBusy || busy.current) {
      await refreshTracks();
      setDataVersion((v) => v + 1);
    }
    busy.current = nowBusy;
  }, [refreshTracks]);

  useEffect(() => {
    refreshStatus().catch(() => {});
    refreshTracks().catch(() => setTracks([]));
    refreshSets().catch(() => {});
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [refreshStatus, refreshTracks, refreshSets]);

  const active = status ? status.analysis.running || status.spotify.job.running : false;
  useEffect(() => {
    const timer = setInterval(() => refreshStatus().catch(() => {}), active ? 1500 : 8000);
    return () => clearInterval(timer);
  }, [active, refreshStatus]);

  const togglePlay = useCallback(
    (track: Track) => {
      if (!audio.current) {
        audio.current = new Audio();
        audio.current.addEventListener("ended", () => setPlaying(null));
      }
      const el = audio.current;
      if (playing === track.id) {
        el.pause();
        setPlaying(null);
      } else {
        el.src = `/api/tracks/${track.id}/audio`;
        el.play().catch(() => setPlaying(null));
        setPlaying(track.id);
      }
    },
    [playing],
  );

  const go = useCallback((path: string) => {
    window.location.hash = `#/${path}`;
  }, []);

  return (
    <Ctx.Provider value={{ status, tracks, sets, refreshTracks, refreshSets, refreshStatus, dataVersion, playing, togglePlay, route, go, openTrack, detailId }}>
      {children}
    </Ctx.Provider>
  );
}
