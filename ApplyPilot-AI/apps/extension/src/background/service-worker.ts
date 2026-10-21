/// <reference types="chrome" />
import type { Msg, MsgResponse } from "../shared/messages";
import { clearJobState, clearMatch, jobKey, matchKey, setJobState, type JobState } from "../shared/storage";
import type { ExtractedJob } from "@applypilot/shared-types";

// MV3 service workers are killed when idle, so NO state lives in module variables: everything is in chrome.storage,
// and all listeners are registered synchronously at top level so they wake the worker.

const MENU_ID = "applypilot-analyze";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: "Analyze this job with ApplyPilot", contexts: ["page"] }, () => void chrome.runtime.lastError);
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined); // toolbar click opens the popup
});

function originOf(url: string | undefined): string | null {
  try { const u = new URL(url ?? ""); return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null; } catch { return null; }
}

/** Inject the self-contained content script on demand (only after a user action) and read the result. */
export async function extractFromTab(tabId: number): Promise<JobState> {
  const tab = await chrome.tabs.get(tabId);
  const origin = originOf(tab.url);
  if (!origin) return { status: "unsupported", reason: "Browser pages can't be analyzed. Open a job posting or paste the description manually." };
  if (origin === "https://chromewebstore.google.com") return { status: "unsupported", reason: "Chrome doesn't allow extensions to read this page." };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (window as unknown as { __applypilotExtract?: () => unknown }).__applypilotExtract?.() ?? null });
    const found = res?.result as ExtractedJob | null | undefined;
    if (!found) return { status: "not_found" };
    return { status: "ready", job: { ...found, source: "auto", adapter: found.adapter } };
  } catch {
    // Without activeTab or a granted host permission Chrome refuses injection; ask the user to allow this one site.
    const has = await chrome.permissions.contains({ origins: [`${origin}/*`] });
    return has ? { status: "not_found" } : { status: "needs_permission", origin };
  }
}

async function runExtraction(tabId: number): Promise<JobState> {
  await setJobState(tabId, { status: "extracting" });
  const state = await extractFromTab(tabId).catch((): JobState => ({ status: "not_found" }));
  await setJobState(tabId, state);
  return state;
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse: (r: MsgResponse) => void) => {
  // Only our own extension pages may drive the worker (not content scripts, not other extensions).
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  if (msg?.type === "EXTRACT_JOB" && Number.isInteger(msg.tabId)) {
    runExtraction(msg.tabId).then((state) => sendResponse({ ok: true, state }), (e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
    return true; // async response
  }
  return false;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.id == null) return;
  const tabId = tab.id;
  chrome.sidePanel.open({ tabId }).catch(() => undefined); // must be called synchronously inside the user gesture
  void runExtraction(tabId);
});

// A job state belongs to one page: drop it on navigation or when the tab closes.
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url) void Promise.all([clearJobState(tabId), clearMatch(tabId)]); });
chrome.tabs.onRemoved.addListener((tabId) => { void chrome.storage.session.remove([jobKey(tabId), matchKey(tabId)]); });
