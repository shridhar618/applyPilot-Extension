import type { JobState } from "./storage";

/** UI -> service worker messages. The worker only accepts these from this extension's own pages. */
export type Msg = { type: "EXTRACT_JOB"; tabId: number };
export type MsgResponse = { ok: true; state: JobState } | { ok: false; error: string };

export function extractJobFromTab(tabId: number): Promise<MsgResponse> {
  return chrome.runtime.sendMessage({ type: "EXTRACT_JOB", tabId } satisfies Msg);
}
