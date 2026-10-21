import { Globe, Keyboard, ScanSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { detectJob, requestSitePermission, setManualJob } from "../analysis";
import { useAction } from "../hooks";
import type { ActiveTab } from "../hooks";
import type { JobDraft, JobState } from "../storage";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Skeleton, TextArea } from "../ui";

export function DetectionBadge({ job }: { job: JobDraft }) {
  if (job.source === "manual") return <Badge tone="violet" icon={<Keyboard size={11} />}>Entered manually</Badge>;
  return <Badge tone={job.confidence === "low" ? "warn" : "ok"} icon={<ScanSearch size={11} />}>Detected automatically{job.adapter && job.adapter !== "generic" ? ` · ${job.adapter}` : ""}</Badge>;
}

export function JobSummary({ job, onEdit }: { job: JobDraft; onEdit?: () => void }) {
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-1.5"><DetectionBadge job={job} />{job.confidence === "low" && <Badge tone="warn">Low confidence · please review</Badge>}</div>
      <h2 className="font-display text-[15px] font-bold leading-snug">{job.title}</h2>
      <p className="text-ink-dim">{[job.company, job.location, job.employmentType].filter(Boolean).join(" · ") || "Company and location not found"}</p>
      {job.salaryText && <p className="mt-1 font-mono text-[12px] text-accent">{job.salaryText}</p>}
      <p className="mt-2 line-clamp-3 text-[12px] text-ink-dim">{job.description}</p>
      {onEdit && <button onClick={onEdit} className="mt-2 text-[12px] text-accent hover:underline">Edit details</button>}
    </Card>
  );
}

export function ManualJobForm({ tab, initial, onDone }: { tab: ActiveTab; initial?: Partial<JobDraft>; onDone?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const url = initial?.url ?? (/^https?:/.test(tab.url) ? tab.url : "");
  const save = useAction(async () => { await setManualJob(tab.id, { title: title.trim(), company: company.trim(), location: location.trim(), url, description: description.trim() }); onDone?.(); });
  const short = description.trim().length > 0 && description.trim().length < 30;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save.run(); }} aria-label="Enter job details manually">
      <Field label="Job title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2"><Field label="Company" value={company} onChange={(e) => setCompany(e.target.value)} /><Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      <TextArea label="Job description" required rows={8} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the full job description, including Requirements and Preferred sections."
        error={short ? "Paste a bit more: at least 30 characters." : undefined} hint="Section headings like “Requirements” and “Nice to have” improve the analysis." />
      {save.error && <ErrorBanner message={save.error} />}
      <Button type="submit" block loading={save.loading} disabled={!title.trim() || description.trim().length < 30}>Use this job</Button>
    </form>
  );
}

/** Everything the user sees before a job is ready: detect, permission, failure + manual fallback. */
export function JobDetector({ tab, state, compact }: { tab: ActiveTab | null; state: JobState; compact?: boolean }) {
  const [manual, setManual] = useState(false);
  const detect = useAction(async () => { if (tab) await detectJob(tab.id); });
  const allow = useAction(async (origin: string) => { if (tab && (await requestSitePermission(origin))) await detectJob(tab.id); });
  if (!tab) return <Skeleton className="h-20" />;
  if (manual) return <Card><ManualJobForm tab={tab} onDone={() => setManual(false)} /><button onClick={() => setManual(false)} className="mt-2 w-full text-[12px] text-ink-dim hover:text-ink">Cancel</button></Card>;
  const host = (() => { try { return new URL(tab.url).hostname; } catch { return "this page"; } })();
  const busy = state.status === "extracting" || detect.loading;

  if (state.status === "needs_permission") {
    return (
      <Card className="space-y-3">
        <div className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div><p className="font-medium">Allow ApplyPilot on {new URL(state.origin).hostname}?</p>
            <p className="text-ink-dim">Chrome needs your permission to read the job posting on this site. We read only this page, only when you click Analyze, and never browsing history.</p></div></div>
        <Button block loading={allow.loading} onClick={() => void allow.run(state.origin)}>Allow on this site</Button>
        {allow.error && <ErrorBanner message={allow.error} />}
        <button onClick={() => setManual(true)} className="w-full text-[12px] text-ink-dim hover:text-accent">Or paste the description instead</button>
      </Card>
    );
  }
  return (
    <div className="space-y-2.5">
      {state.status === "unsupported" && <ErrorBanner tone="warn" message={state.reason} />}
      {state.status === "not_found" && <ErrorBanner tone="warn" message="We couldn't find a job posting on this page. Some sites change their layout or load content in frames. You can paste the description instead." />}
      {detect.error && <ErrorBanner message={detect.error} onRetry={() => void detect.run()} />}
      {busy ? <div className="space-y-2" aria-busy><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-12" /></div> : (
        <EmptyState icon={<Globe size={18} />} title={compact ? host : `Ready to analyze ${host}`} action={
          <div className="mt-1 flex w-full flex-col gap-2">
            <Button block icon={<ScanSearch size={15} />} onClick={() => void detect.run()}>Analyze this page</Button>
            <Button block variant="subtle" icon={<Keyboard size={15} />} onClick={() => setManual(true)}>Paste job description</Button>
          </div>}>
          Open a job posting, then analyze it. Works best on Greenhouse, Lever and pages with structured job data.
        </EmptyState>
      )}
    </div>
  );
}
