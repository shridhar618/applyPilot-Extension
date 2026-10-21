import type { AIStatus, ApplicationOut, ApplicationStatus, JobInput, JobOut, MatchExplanation, MatchOut, Page, ResumeDetail, ResumeSummary, TokenOut, User } from "@applypilot/shared-types";
import { clearAuth, getAuth, getSettings, setAuth } from "./storage";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export function normalizeBackendUrl(raw: string): string {
  const u = new URL(raw.trim());
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("URL must start with http:// or https://");
  if (u.protocol === "http:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Use https:// for non-local servers so your resume data is encrypted in transit.");
  return u.origin;
}

async function request<T>(path: string, init: { method?: string; body?: unknown; form?: FormData; auth?: boolean; timeoutMs?: number; root?: boolean } = {}): Promise<T> {
  const { backendUrl } = await getSettings();
  const headers: Record<string, string> = {};
  const authed = init.auth !== false;
  if (authed) {
    const a = await getAuth();
    if (!a) throw new ApiError(401, "unauthorized", "Please sign in to continue.");
    headers.Authorization = `Bearer ${a.token}`;
  }
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${backendUrl}${init.root ? "" : "/api/v1"}${path}`, { method: init.method ?? "GET", headers, signal: ctl.signal,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined) });
  } catch (e) {
    const timedOut = (e as Error).name === "AbortError";
    throw new ApiError(0, timedOut ? "timeout" : "network",
      timedOut ? "The server took too long to respond. Try again." : `Can't reach the ApplyPilot server at ${backendUrl}. Is the backend running? Check Settings.`);
  } finally { clearTimeout(timer); }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && authed) { await clearAuth(); throw new ApiError(401, "session_expired", "Your session expired. Please sign in again."); }
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status}).`, err?.details);
  }
  return data as T;
}

async function authenticate(path: string, body: unknown): Promise<User> {
  const t = await request<TokenOut>(path, { method: "POST", body, auth: false });
  await setAuth({ token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000, user: t.user });
  return t.user;
}

const jobBody = (j: JobInput) => ({ ...j, url: j.url || null });

export const api = {
  health: () => request<{ status: string }>("/health", { auth: false, root: true, timeoutMs: 5_000 }),
  register: (email: string, password: string, full_name: string) => authenticate("/auth/register", { email, password, full_name }),
  login: (email: string, password: string) => authenticate("/auth/login", { email, password }),
  async logout() { try { await request<void>("/auth/logout", { method: "POST" }); } finally { await clearAuth(); } },
  me: () => request<User>("/auth/me"),
  setAiConsent: async (ai_consent: boolean) => {
    const user = await request<User>("/auth/me", { method: "PATCH", body: { ai_consent } });
    const a = await getAuth();
    if (a) await setAuth({ ...a, user });
    return user;
  },
  aiStatus: () => request<AIStatus>("/ai/status"),
  listResumes: () => request<Page<ResumeSummary>>("/resumes?limit=100"),
  uploadResume: (file: File, name?: string) => { const f = new FormData(); f.append("file", file); if (name) f.append("name", name); return request<ResumeDetail>("/resumes", { method: "POST", form: f, timeoutMs: 60_000 }); },
  createManualResume: (name: string, text: string) => request<ResumeDetail>("/resumes/manual", { method: "POST", body: { name, text } }),
  setDefaultResume: (id: number) => request<ResumeDetail>(`/resumes/${id}`, { method: "PATCH", body: { is_default: true } }),
  deleteResume: (id: number) => request<void>(`/resumes/${id}`, { method: "DELETE" }),
  previewMatch: (resume_id: number, job: JobInput) => request<MatchOut>("/matches/preview", { method: "POST", body: { resume_id, job: jobBody(job) }, timeoutMs: 45_000 }),
  saveJob: (job: JobInput) => request<JobOut>("/jobs", { method: "POST", body: jobBody(job) }),
  createMatch: (resume_id: number, job_id: number) => request<MatchOut>("/matches", { method: "POST", body: { resume_id, job_id } }),
  explainMatch: (match_id: number) => request<MatchExplanation>(`/matches/${match_id}/explain`, { method: "POST", timeoutMs: 90_000 }),
  createApplication: (job_id: number, resume_id: number | null, status: ApplicationStatus, notes: string) =>
    request<ApplicationOut>("/applications", { method: "POST", body: { job_id, resume_id, status, notes } }),
  updateApplication: (id: number, patch: Partial<{ status: ApplicationStatus; notes: string }>) => request<ApplicationOut>(`/applications/${id}`, { method: "PATCH", body: patch }),
  listApplications: (limit = 5) => request<Page<ApplicationOut>>(`/applications?limit=${limit}`),
};
