import type { AIStatus, User } from "@applypilot/shared-types";
import { LogOut, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { api, normalizeBackendUrl } from "../api";
import { useAction } from "../hooks";
import { DEFAULT_BACKEND, getSettings, setSettings } from "../storage";
import { Badge, Button, Card, ErrorBanner, Field, SectionTitle, SuccessNote } from "../ui";

export function SettingsView({ user }: { user: User | null }) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<"checking" | "up" | "down">("checking");
  const [ai, setAi] = useState<AIStatus | null>(null);
  useEffect(() => { void getSettings().then((s) => setUrl(s.backendUrl)); }, []);
  const check = () => { setHealth("checking"); api.health().then(() => setHealth("up"), () => setHealth("down")); };
  useEffect(check, [saved]);
  useEffect(() => { if (user) api.aiStatus().then(setAi, () => setAi(null)); }, [user]);

  const saveUrl = useAction(async () => {
    const origin = normalizeBackendUrl(url);
    const builtin = [new URL(DEFAULT_BACKEND).origin, "http://127.0.0.1:8000"];
    if (!builtin.includes(origin) && !(await chrome.permissions.request({ origins: [`${origin}/*`] }))) throw new Error("Permission to contact that server was declined, so it can't be used.");
    await setSettings({ backendUrl: origin }); setUrl(origin); setSaved(true); setTimeout(() => setSaved(false), 2500);
  });
  const consent = useAction(async (v: boolean) => { const u = await api.setAiConsent(v); setAi((a) => (a ? { ...a, consent_given: u.ai_consent } : a)); });
  const logout = useAction(() => api.logout());

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <SectionTitle aside={<Badge tone={health === "up" ? "ok" : health === "down" ? "bad" : "neutral"} icon={<Server size={11} />}>{health === "up" ? "Server reachable" : health === "down" ? "Unreachable" : "Checking…"}</Badge>}>Server</SectionTitle>
        <Field label="Backend URL" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" spellCheck={false} hint="Local development: http://localhost:8000. Production servers must use https://." />
        {saveUrl.error && <ErrorBanner message={saveUrl.error} />}
        {saved && <SuccessNote>Server updated.</SuccessNote>}
        <Button block variant="subtle" loading={saveUrl.loading} onClick={() => void saveUrl.run()}>Save server URL</Button>
      </Card>

      {user && (<>
        <Card className="space-y-2">
          <SectionTitle>AI features</SectionTitle>
          {ai && !ai.configured && <ErrorBanner tone="warn" message="No AI provider is configured on your server. Everything except AI explanations works without one. See the README, “Configure the AI provider”." />}
          {ai?.configured && <p className="text-[12px] text-ink-dim">Provider: <span className="font-mono text-ink">{ai.provider}</span> · model <span className="font-mono text-ink">{ai.model}</span></p>}
          <p className="text-[12px] text-ink-dim">AI explanations send your resume and job text to that provider. Nothing is sent unless you allow it here.</p>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#22D3EE]" checked={ai?.consent_given ?? user.ai_consent} disabled={consent.loading} onChange={(e) => void consent.run(e.target.checked)} />
            Allow sending my resume and job text to the AI provider
          </label>
          {consent.error && <ErrorBanner message={consent.error} />}
        </Card>
        <Card className="space-y-2">
          <SectionTitle>Account</SectionTitle>
          <p className="text-[12px] text-ink-dim">Signed in as <span className="text-ink">{user.email}</span></p>
          <Button variant="danger" block loading={logout.loading} icon={<LogOut size={15} />} onClick={() => void logout.run()}>Sign out</Button>
        </Card>
      </>)}

      <Card className="space-y-1.5">
        <SectionTitle>Permissions, in plain words</SectionTitle>
        <ul className="list-disc space-y-1 pl-4 text-[12px] text-ink-dim">
          <li><strong className="text-ink">Active tab / scripting:</strong> read the job posting on the page you choose to analyze.</li>
          <li><strong className="text-ink">Per-site access:</strong> requested one site at a time, only if you click “Allow”.</li>
          <li><strong className="text-ink">Side panel / storage / context menu:</strong> the working panel, your sign-in, and the right-click shortcut.</li>
          <li>We never read your browsing history or run on pages you haven’t acted on.</li>
        </ul>
      </Card>
    </div>
  );
}
