import type { EvidenceStatus, MatchOut, SkillFinding } from "@applypilot/shared-types";
import { AlertCircle, CheckCircle2, CircleDashed, CircleHelp, Info, Sparkles, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { api, ApiError } from "../api";
import { useAction } from "../hooks";
import { Badge, Bar, Button, Card, ErrorBanner, Mono, ScoreRing, SectionTitle, Skeleton } from "../ui";

const STATUS: Record<EvidenceStatus, { label: string; tone: "ok" | "info" | "warn" | "bad" | "neutral"; icon: ReactNode; hint: string }> = {
  evidenced: { label: "Evidenced", tone: "ok", icon: <CheckCircle2 size={11} />, hint: "Appears in experience or project text" },
  stated: { label: "Listed", tone: "info", icon: <CircleDashed size={11} />, hint: "Listed in skills, but no project or job bullet shows it" },
  needs_verification: { label: "Verify", tone: "warn", icon: <CircleHelp size={11} />, hint: "Found outside skills/experience/projects" },
  absent: { label: "Not found", tone: "bad", icon: <XCircle size={11} />, hint: "Not on your resume. That doesn't mean you lack it." },
  not_assessable: { label: "N/A", tone: "neutral", icon: <CircleHelp size={11} />, hint: "Can't be assessed" },
};

function Findings({ title, items }: { title: string; items: SkillFinding[] }) {
  if (!items.length) return null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <ul className="space-y-1.5">
        {items.map((f) => { const s = STATUS[f.status]; return (
          <li key={f.skill} className="rounded-sm border border-line bg-bg-2 p-2">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{f.skill}</span><span title={s.hint}><Badge tone={s.tone} icon={s.icon}>{s.label}</Badge></span></div>
            {f.evidence && <p className="mt-1 border-l-2 border-ok/40 pl-2 text-[12px] italic text-ink-dim">“{f.evidence}”</p>}
          </li>); })}
      </ul>
    </div>
  );
}

export function MatchView({ match, onRerun }: { match: MatchOut; onRerun?: () => void }) {
  const r = match.result;
  const by = (req: SkillFinding["requirement"]) => r.skill_findings.filter((f) => f.requirement === req);
  return (
    <div className="space-y-3">
      <Card className="flex flex-col items-center gap-2">
        <ScoreRing score={r.score} />
        <p className="text-center text-[11px] text-ink-dim">Estimated resume-to-job compatibility. This is <strong className="text-ink">not</strong> an official ATS score.</p>
      </Card>
      <Card>
        <SectionTitle>How this was calculated</SectionTitle>
        <ul className="space-y-2.5">
          {r.components.map((c) => (
            <li key={c.key}>
              <div className="mb-1 flex items-center justify-between"><span className="font-medium">{c.label}</span>
                {c.assessable ? <Mono><span className="text-[12px] text-ink-dim">{Math.round((c.value ?? 0) * 100)}% × {Math.round(c.effective_weight * 100)}% weight</span></Mono> : <Badge>Not assessable · weight redistributed</Badge>}</div>
              {c.assessable && <Bar value={c.value ?? 0} />}
              <p className="mt-1 text-[11px] text-ink-dim">{c.detail}</p>
            </li>))}
        </ul>
      </Card>
      <Card className="space-y-3">
        <Findings title="Required skills" items={by("required")} />
        <Findings title="Preferred skills" items={by("preferred")} />
        <Findings title="Mentioned (not scored)" items={by("mentioned")} />
        {!r.skill_findings.length && <p className="text-ink-dim">No known skills were identified in this posting. Edit the requirements or paste a fuller description.</p>}
      </Card>
      {(r.strengths.length > 0 || r.concerns.length > 0 || r.recommended_actions.length > 0) && (
        <Card className="space-y-3">
          {r.strengths.length > 0 && <Notes title="Strengths" tone="ok" items={r.strengths} />}
          {r.concerns.length > 0 && <Notes title="Concerns" tone="warn" items={r.concerns} />}
          {r.recommended_actions.length > 0 && <Notes title="What you could do" tone="info" items={r.recommended_actions} />}
        </Card>)}
      <Card>
        <SectionTitle>Notes</SectionTitle>
        <ul className="space-y-1 text-[12px] text-ink-dim">{r.notes.map((n) => <li key={n} className="flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0" aria-hidden />{n}</li>)}</ul>
        <p className="mt-2 text-[11px] text-ink-dim">Semantic method: {r.semantic_method}</p>
      </Card>
      {onRerun && <Button variant="subtle" block onClick={onRerun}>Re-run analysis</Button>}
    </div>
  );
}

const NOTE_TONE = { ok: "text-ok", warn: "text-warn", info: "text-accent" } as const; // static class names so Tailwind can see them
function Notes({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "warn" | "info" }) {
  return (<div><SectionTitle>{title}</SectionTitle><ul className="space-y-1.5">{items.map((t) => <li key={t} className="flex gap-2 text-[12px]"><AlertCircle size={13} className={`mt-0.5 shrink-0 ${NOTE_TONE[tone]}`} aria-hidden />{t}</li>)}</ul></div>);
}

export function MatchSkeleton() {
  return <div className="space-y-3" aria-busy aria-label="Analyzing"><Skeleton className="mx-auto h-28 w-28 rounded-full" /><Skeleton className="h-32" /><Skeleton className="h-40" /></div>;
}

/** AI narrative on top of the deterministic score. Requires a saved match, a configured provider and explicit consent. */
export function ExplainWithAI({ matchId, consent, onConsent }: { matchId: number | null; consent: boolean; onConsent: () => void }) {
  const [ask, setAsk] = useState(false);
  const run = useAction(async () => { if (matchId == null) return null; return api.explainMatch(matchId); });
  const grant = useAction(async () => { await api.setAiConsent(true); onConsent(); setAsk(false); return run.run(); });
  const [out, setOut] = useState<Awaited<ReturnType<typeof api.explainMatch>> | null>(null);
  const go = async () => { if (!consent) { setAsk(true); return; } const r = await run.run(); if (r) setOut(r); };
  if (matchId == null) return <Card><p className="text-ink-dim">Save this job (Save tab) to enable AI explanations. They run on a saved analysis.</p></Card>;
  return (
    <Card className="space-y-2.5">
      <SectionTitle>AI explanation</SectionTitle>
      {!out && !ask && <Button block variant="subtle" loading={run.loading} icon={<Sparkles size={15} />} onClick={() => void go()}>Explain this score with AI</Button>}
      {ask && (
        <div className="space-y-2 rounded-sm border border-accent-violet/30 bg-accent-violet/5 p-2.5">
          <p className="font-medium">Send your resume and this job to your AI provider?</p>
          <p className="text-[12px] text-ink-dim">The full text of your resume and the job description is sent to the AI provider configured on your server, only for this feature. The score itself is computed locally by the algorithm and never by the AI. You can revoke this in Settings.</p>
          <div className="flex gap-2"><Button loading={grant.loading} onClick={async () => { const r = await grant.run(); if (r) setOut(r); }}>I agree, explain</Button><Button variant="ghost" onClick={() => setAsk(false)}>Cancel</Button></div>
        </div>)}
      {(run.error || grant.error) && <ErrorBanner message={(run.error ?? grant.error)!} tone="warn" />}
      {out && (<div className="space-y-2"><p>{out.summary}</p>
        <ol className="list-decimal space-y-1 pl-4 text-[12px]">{out.top_priorities.map((p) => <li key={p}>{p}</li>)}</ol>
        {out.caveats.length > 0 && <p className="text-[11px] text-ink-dim">{out.caveats.join(" ")}</p>}
        <p className="text-[11px] text-ink-dim">AI-generated commentary. Verify against your own experience.</p></div>)}
    </Card>
  );
}

export const isNotConfigured = (e: unknown) => e instanceof ApiError && e.code === "ai_not_configured";
