import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChrome } from "../test/chrome-mock";
import { JSONLD_PAGE } from "../adapters/__fixtures__/pages";

let env: ReturnType<typeof installChrome>;
const OWN = { id: "testextensionid", url: "chrome-extension://testextensionid/sidepanel.html" };

async function boot() {
  vi.resetModules();
  env = installChrome();
  await import("./service-worker");
}
const send = (msg: unknown, sender: unknown) => new Promise<unknown>((res) => {
  const handled = env.listeners.onMessage[0](msg, sender, res);
  if (handled !== true) res("__not_handled__");
});

beforeEach(boot);

describe("service worker", () => {
  it("registers lifecycle listeners synchronously and creates the context menu on install", () => {
    expect(env.listeners.onInstalled).toHaveLength(1);
    env.listeners.onInstalled[0]();
    expect(env.chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("ApplyPilot") }), expect.any(Function));
    expect(env.chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it("ignores messages from content scripts, web pages and other extensions", async () => {
    expect(await send({ type: "EXTRACT_JOB", tabId: 7 }, { id: "otherextension", url: "chrome-extension://otherextension/x.html" })).toBe("__not_handled__");
    expect(await send({ type: "EXTRACT_JOB", tabId: 7 }, { id: "testextensionid", url: "https://evil.example/" })).toBe("__not_handled__");
    expect(env.chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("rejects malformed messages", async () => {
    expect(await send({ type: "EXTRACT_JOB", tabId: "7; drop" }, OWN)).toBe("__not_handled__");
    expect(await send({ type: "SOMETHING_ELSE" }, OWN)).toBe("__not_handled__");
  });

  it("injects the content script, stores the extracted job and returns it", async () => {
    env.chrome.tabs.get.mockResolvedValue({ id: 7, url: "https://careers.acme.example/jobs/1" });
    const job = { title: "Data Engineer", company: "Acme", location: "", employmentType: "", salaryText: "", description: "x".repeat(300), url: "https://careers.acme.example/jobs/1", adapter: "structured-data", confidence: "high" };
    env.chrome.scripting.executeScript.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: job }]);
    const r = (await send({ type: "EXTRACT_JOB", tabId: 7 }, OWN)) as { ok: boolean; state: { status: string; job: { source: string } } };
    expect(r.ok).toBe(true);
    expect(r.state.status).toBe("ready");
    expect(r.state.job.source).toBe("auto");
    expect(env.chrome.scripting.executeScript.mock.calls[0][0]).toMatchObject({ target: { tabId: 7 }, files: ["content.js"] });
    expect(env.session.data["job:7"]).toMatchObject({ status: "ready" });
  });

  it("reports not_found when the page has no job", async () => {
    env.chrome.tabs.get.mockResolvedValue({ id: 7, url: "https://blog.example/post" });
    env.chrome.scripting.executeScript.mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ result: null }]);
    expect(((await send({ type: "EXTRACT_JOB", tabId: 7 }, OWN)) as { state: { status: string } }).state.status).toBe("not_found");
  });

  it("asks for per-site permission when Chrome refuses injection", async () => {
    env.chrome.tabs.get.mockResolvedValue({ id: 7, url: "https://careers.acme.example/jobs/1?token=secret" });
    env.chrome.scripting.executeScript.mockRejectedValue(new Error("Cannot access contents of the page."));
    env.chrome.permissions.contains.mockResolvedValue(false);
    const r = (await send({ type: "EXTRACT_JOB", tabId: 7 }, OWN)) as { state: { status: string; origin: string } };
    expect(r.state).toEqual({ status: "needs_permission", origin: "https://careers.acme.example" }); // origin only: no path/query leaks
  });

  it.each(["chrome://extensions", "chrome-extension://abc/page.html", "file:///etc/passwd", "about:blank"])("refuses unsupported page %s without injecting", async (url) => {
    env.chrome.tabs.get.mockResolvedValue({ id: 7, url });
    const r = (await send({ type: "EXTRACT_JOB", tabId: 7 }, OWN)) as { state: { status: string } };
    expect(r.state.status).toBe("unsupported");
    expect(env.chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("drops per-tab state on navigation and tab close", async () => {
    await env.session.set({ "job:7": { status: "idle" }, "match:7": {}, "job:8": { status: "idle" } });
    env.listeners.tabsUpdated[0](7, { url: "https://other.example" });
    await vi.waitFor(() => expect(env.session.data["job:7"]).toBeUndefined());
    expect(env.session.data["match:7"]).toBeUndefined();
    env.listeners.tabsRemoved[0](8);
    await vi.waitFor(() => expect(env.session.data["job:8"]).toBeUndefined());
  });

  it("context-menu click opens the panel and extracts", async () => {
    env.chrome.tabs.get.mockResolvedValue({ id: 7, url: "https://careers.acme.example/j" });
    env.chrome.scripting.executeScript.mockResolvedValue([{ result: null }]);
    env.listeners.menuClicked[0]({ menuItemId: "applypilot-analyze" }, { id: 7 });
    expect(env.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });
    await vi.waitFor(() => expect(env.session.data["job:7"]).toMatchObject({ status: "not_found" }));
    void JSONLD_PAGE;
  });
});
