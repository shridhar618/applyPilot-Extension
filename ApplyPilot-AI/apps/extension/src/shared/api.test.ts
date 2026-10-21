import { beforeEach, describe, expect, it } from "vitest";
import { api, ApiError, normalizeBackendUrl } from "./api";
import { getAuth, setSettings } from "./storage";
import { installChrome, mockFetch, signIn, USER } from "../test/chrome-mock";

let env: ReturnType<typeof installChrome>;
beforeEach(() => { env = installChrome(); });

describe("auth flow", () => {
  it("stores the session on login and sends it as a bearer token", async () => {
    const f = mockFetch((url) => url.endsWith("/auth/login") ? { body: { access_token: "T1", token_type: "bearer", expires_in: 3600, user: USER } } : { body: { items: [], total: 0, limit: 100, offset: 0 } });
    await api.login("a@example.com", "pw-pw-pw-pw");
    expect((await getAuth())?.token).toBe("T1");
    await api.listResumes();
    const [, init] = f.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer T1");
    expect(f.mock.calls[1][0]).toBe("http://localhost:8000/api/v1/resumes?limit=100");
  });

  it("does not send credentials for login/register", async () => {
    const f = mockFetch(() => ({ body: { access_token: "T", token_type: "bearer", expires_in: 60, user: USER } }));
    await api.register("a@example.com", "long-password-1", "A");
    expect((f.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("clears the session and reports expiry on a 401", async () => {
    await signIn(env.local);
    mockFetch(() => ({ status: 401, body: { error: { code: "unauthorized", message: "Please sign in again.", details: null } } }));
    await expect(api.listResumes()).rejects.toMatchObject({ code: "session_expired", status: 401 });
    expect(await getAuth()).toBeNull();
  });

  it("refuses calls when signed out without touching the network", async () => {
    const f = mockFetch(() => ({}));
    await expect(api.listResumes()).rejects.toMatchObject({ status: 401 });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats an expired stored token as signed out", async () => {
    await env.local.set({ auth: { token: "old", expiresAt: Date.now() - 1, user: USER } });
    expect(await getAuth()).toBeNull();
  });
});

describe("errors", () => {
  it("explains unreachable servers with the configured URL", async () => {
    await signIn(env.local);
    await setSettings({ backendUrl: "http://localhost:9999" });
    mockFetch(() => { throw new TypeError("Failed to fetch"); });
    const e = (await api.listResumes().catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: "network" });
    expect(e.message).toContain("http://localhost:9999");
  });

  it("surfaces the backend's error code and message", async () => {
    await signIn(env.local);
    mockFetch(() => ({ status: 503, body: { error: { code: "ai_not_configured", message: "Set a provider.", details: null } } }));
    await expect(api.explainMatch(1)).rejects.toMatchObject({ code: "ai_not_configured", message: "Set a provider." });
  });

  it("handles 204 responses", async () => {
    await signIn(env.local);
    mockFetch(() => ({ status: 204 }));
    await expect(api.deleteResume(1)).resolves.toBeUndefined();
  });

  it("calls the root health endpoint without auth", async () => {
    const f = mockFetch(() => ({ body: { status: "ok" } }));
    await api.health();
    expect(f.mock.calls[0][0]).toBe("http://localhost:8000/health");
  });
});

describe("normalizeBackendUrl", () => {
  it("allows http only for localhost", () => {
    expect(normalizeBackendUrl("http://localhost:8000/")).toBe("http://localhost:8000");
    expect(normalizeBackendUrl("https://api.example.com/x")).toBe("https://api.example.com");
    expect(() => normalizeBackendUrl("http://api.example.com")).toThrow(/https/);
    expect(() => normalizeBackendUrl("ftp://x.example")).toThrow();
    expect(() => normalizeBackendUrl("not a url")).toThrow();
  });
});
