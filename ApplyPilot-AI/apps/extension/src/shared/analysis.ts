import type { ResumeSummary } from "@applypilot/shared-types";
import { api } from "./api";
import { extractJobFromTab } from "./messages";
import { setJobState, setMatch, type JobDraft } from "./storage";

export const toJobInput = (j: JobDraft) => ({
  title: j.title, company: j.company, location: j.location, employment_type: j.employmentType, salary_text: j.salaryText,
  url: j.url || null, source: j.source, adapter: j.adapter, description: j.description,
});

/** Score the resume against the (possibly unsaved) job and cache the result so popup and side panel show the same thing. */
export async function runMatch(tabId: number, resume: ResumeSummary, job: JobDraft) {
  const match = await api.previewMatch(resume.id, toJobInput(job));
  await setMatch(tabId, { resumeId: resume.id, resumeName: resume.name, jobTitle: job.title, match, at: Date.now() });
  return match;
}

export async function detectJob(tabId: number) {
  const r = await extractJobFromTab(tabId);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export async function setManualJob(tabId: number, job: Pick<JobDraft, "title" | "company" | "location" | "url" | "description">) {
  const draft: JobDraft = { ...job, employmentType: "", salaryText: "", adapter: null, confidence: null, source: "manual" };
  await setJobState(tabId, { status: "ready", job: draft });
  return draft;
}

export async function requestSitePermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${origin}/*`] }); // must run inside a click handler (user gesture)
}
