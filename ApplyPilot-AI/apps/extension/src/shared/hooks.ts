import type { ResumeSummary } from "@applypilot/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { getAuth, getJobState, getMatch, getSelectedResume, getSettings, jobKey, matchKey, setSelectedResume, type Auth, type JobState, type MatchCache, type Settings } from "./storage";

/** Re-reads `read` on mount and whenever one of `keys` changes in the given storage area. */
function useStored<T>(read: () => Promise<T>, area: "local" | "session", keys: string[], initial: T, deps: unknown[] = []): [T, boolean] {
  const [v, setV] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const k = keys.join("|");
  useEffect(() => {
    let live = true;
    const load = () => read().then((x) => { if (live) { setV(x); setLoading(false); } });
    void load();
    const l = (c: Record<string, chrome.storage.StorageChange>, a: string) => { if (a === area && keys.some((key) => key in c)) void load(); };
    chrome.storage.onChanged.addListener(l);
    return () => { live = false; chrome.storage.onChanged.removeListener(l); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, k, ...deps]);
  return [v, loading];
}

export const useAuth = () => useStored<Auth | null>(getAuth, "local", ["auth"], null);
export const useSettings = () => useStored<Settings>(getSettings, "local", ["settings"], { backendUrl: "" });
export const useJobState = (tabId: number | null) =>
  useStored<JobState>(() => (tabId == null ? Promise.resolve({ status: "idle" } as JobState) : getJobState(tabId)), "session", tabId == null ? [] : [jobKey(tabId)], { status: "idle" }, [tabId]);
export const useMatchCache = (tabId: number | null) =>
  useStored<MatchCache | null>(() => (tabId == null ? Promise.resolve(null) : getMatch(tabId)), "session", tabId == null ? [] : [matchKey(tabId)], null, [tabId]);

export interface ActiveTab { id: number; url: string; title: string }
export function useActiveTab(): ActiveTab | null {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  useEffect(() => {
    let live = true;
    const read = async () => {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (live) setTab(t?.id != null ? { id: t.id, url: t.url ?? "", title: t.title ?? "" } : null);
    };
    void read();
    const upd = (_id: number, c: chrome.tabs.TabChangeInfo) => { if (c.status === "complete" || c.url) void read(); };
    chrome.tabs.onActivated.addListener(read); chrome.tabs.onUpdated.addListener(upd);
    return () => { live = false; chrome.tabs.onActivated.removeListener(read); chrome.tabs.onUpdated.removeListener(upd); };
  }, []);
  return tab;
}

export const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

export function useResumes(enabled: boolean) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [selectedId, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const page = await api.listResumes();
      setResumes(page.items);
      const saved = await getSelectedResume();
      const pick = page.items.find((r) => r.id === saved) ?? page.items.find((r) => r.is_default) ?? page.items[0] ?? null;
      setSelected(pick?.id ?? null);
    } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, [enabled]);
  useEffect(() => { void reload(); }, [reload]);
  const select = (id: number) => { setSelected(id); void setSelectedResume(id); };
  return { resumes, selectedId, select, loading, error, reload };
}

/** Guards against double submissions: a second call while one is in flight is ignored. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (...a: A): Promise<R | undefined> => {
    if (busy.current) return undefined;
    busy.current = true; setLoading(true); setError(null);
    try { return await fn(...a); } catch (e) { setError(errorText(e)); return undefined; } finally { busy.current = false; setLoading(false); }
  }, [fn]);
  return { run, loading, error, clearError: () => setError(null) };
}
