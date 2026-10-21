import type { ExtractedJob, MatchOut, User } from "@applypilot/shared-types";

export const DEFAULT_BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

export interface Settings { backendUrl: string }
export interface Auth { token: string; expiresAt: number; user: User }
/** Draft job the user is working on. `source` tells the UI (and backend) whether it was auto-detected or typed in. */
export interface JobDraft extends Omit<ExtractedJob, "adapter" | "confidence"> { source: "auto" | "manual"; adapter: string | null; confidence: ExtractedJob["confidence"] | null }

export type JobState =
  | { status: "idle" }
  | { status: "extracting" }
  | { status: "ready"; job: JobDraft }
  | { status: "not_found" }
  | { status: "needs_permission"; origin: string }
  | { status: "unsupported"; reason: string };

// Token lives in chrome.storage.local: readable only by this extension's own contexts (we never expose storage to web pages).
const local = () => chrome.storage.local;
const session = () => chrome.storage.session;

export async function getSettings(): Promise<Settings> {
  const { settings } = await local().get("settings");
  return { backendUrl: DEFAULT_BACKEND, ...(settings ?? {}) };
}
export const setSettings = (s: Settings) => local().set({ settings: s });

export async function getAuth(): Promise<Auth | null> {
  const { auth } = await local().get("auth");
  if (!auth) return null;
  if ((auth as Auth).expiresAt <= Date.now()) { await clearAuth(); return null; }
  return auth as Auth;
}
export const setAuth = (a: Auth) => local().set({ auth: a });
export const clearAuth = () => local().remove("auth");

export async function getSelectedResume(): Promise<number | null> {
  const { selectedResumeId } = await local().get("selectedResumeId");
  return typeof selectedResumeId === "number" ? selectedResumeId : null;
}
export const setSelectedResume = (id: number | null) => (id == null ? local().remove("selectedResumeId") : local().set({ selectedResumeId: id }));

export const jobKey = (tabId: number) => `job:${tabId}`;
export async function getJobState(tabId: number): Promise<JobState> {
  const r = await session().get(jobKey(tabId));
  return (r[jobKey(tabId)] as JobState | undefined) ?? { status: "idle" };
}
export const setJobState = (tabId: number, s: JobState) => session().set({ [jobKey(tabId)]: s });
export const clearJobState = (tabId: number) => session().remove(jobKey(tabId));

/** Which side-panel tab to show (lets the popup deep-link into Settings/Resumes). */
export const requestPanelTab = (tab: string) => session().set({ panelTab: tab });

/** Latest match result for a tab, shared between the popup and the side panel so they never disagree. */
export interface MatchCache { resumeId: number; resumeName: string; jobTitle: string; match: MatchOut; at: number }
export const matchKey = (tabId: number) => `match:${tabId}`;
export async function getMatch(tabId: number): Promise<MatchCache | null> {
  const r = await session().get(matchKey(tabId));
  return (r[matchKey(tabId)] as MatchCache | undefined) ?? null;
}
export const setMatch = (tabId: number, m: MatchCache) => session().set({ [matchKey(tabId)]: m });
export const clearMatch = (tabId: number) => session().remove(matchKey(tabId));
