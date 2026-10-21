import { vi } from "vitest";

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

/** Minimal in-memory chrome.* implementation: storage (with onChanged), tabs, permissions, scripting, runtime. */
export function installChrome() {
  const changeListeners = new Set<(c: Changes, area: string) => void>();
  const makeArea = (name: string) => {
    const data: Record<string, unknown> = {};
    return {
      data,
      get: vi.fn(async (keys?: string | string[] | null) => {
        const ks = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        const c: Changes = {};
        for (const [k, v] of Object.entries(items)) { c[k] = { oldValue: data[k], newValue: v }; data[k] = structuredClone(v); }
        changeListeners.forEach((l) => l(c, name));
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const c: Changes = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) { if (k in data) { c[k] = { oldValue: data[k] }; delete data[k]; } }
        if (Object.keys(c).length) changeListeners.forEach((l) => l(c, name));
      }),
    };
  }
  const local = makeArea("local"), session = makeArea("session");
  const listeners = {
    onMessage: [] as ((...a: unknown[]) => unknown)[], onInstalled: [] as (() => void)[], menuClicked: [] as ((...a: unknown[]) => void)[],
    tabsUpdated: [] as ((...a: unknown[]) => void)[], tabsRemoved: [] as ((...a: unknown[]) => void)[],
  };
  const chromeMock = {
    runtime: { id: "testextensionid", getURL: (p: string) => `chrome-extension://testextensionid/${p}`, lastError: undefined,
      onMessage: { addListener: (f: never) => listeners.onMessage.push(f) }, onInstalled: { addListener: (f: never) => listeners.onInstalled.push(f) }, sendMessage: vi.fn() },
    storage: { local, session, onChanged: { addListener: (f: never) => changeListeners.add(f), removeListener: (f: never) => changeListeners.delete(f) } },
    tabs: { get: vi.fn(), query: vi.fn(async () => [{ id: 7, url: "https://boards.greenhouse.io/acme/jobs/1", title: "Job" }]),
      onActivated: { addListener: vi.fn(), removeListener: vi.fn() }, onUpdated: { addListener: (f: never) => listeners.tabsUpdated.push(f), removeListener: vi.fn() }, onRemoved: { addListener: (f: never) => listeners.tabsRemoved.push(f) } },
    permissions: { contains: vi.fn(async () => false), request: vi.fn(async () => true) },
    scripting: { executeScript: vi.fn() },
    contextMenus: { create: vi.fn(), onClicked: { addListener: (f: never) => listeners.menuClicked.push(f) } },
    sidePanel: { open: vi.fn(async () => undefined), setPanelBehavior: vi.fn(async () => undefined) },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  return { chrome: chromeMock, local, session, listeners };
}

export function mockFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>) {
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    const r = await handler(url, init);
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

export const USER = { id: 1, email: "a@example.com", full_name: "Asha Rao", ai_consent: false };
export async function signIn(local: { set: (i: Record<string, unknown>) => Promise<void> }) {
  await local.set({ auth: { token: "tok", expiresAt: Date.now() + 3_600_000, user: USER } });
}
