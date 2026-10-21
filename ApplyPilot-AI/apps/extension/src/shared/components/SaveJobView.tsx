import type { ApplicationOut, ApplicationStatus, ResumeSummary } from "@applypilot/shared-types";
import { Bookmark } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api";
import { toJobInput } from "../analysis";
import { useAction } from "../hooks";
import { setMatch, type JobDraft, type MatchCache } from "../storage";
import { Button, Card, ErrorBanner, Select, SuccessNote, TextArea } from "../ui";

const STATUSES: { v: ApplicationStatus; l: string }[] = [
  { v: "saved", l: "Saved" }, { v: "preparing", l: "Preparing" }, { v: "ready_to_apply", l: "Ready to apply" },
  { v: "applied", l: "Applied" }, { v: "assessment", l: "Assessment" }, { v: "interview", l: "Interview" },
  { v: "offer", l: "Offer" }, { v: "rejected", l: "Rejected" }, { v: "withdrawn", l: "Withdrawn" },
];

/** Saves the job, then creates the tracked application. Nothing is ever submitted to an employer from here. */
export function SaveJobView({ job, resume, tabId }: { job: JobDraft; resume: ResumeSummary | null; tabId: number }) {
  const [status, setStatus] = useState<ApplicationStatus>("saved");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<ApplicationOut | null>(null);
  const [already, setAlready] = useState(false);
  const save = useAction(async () => {
    const j = await api.saveJob(toJobInput(job));
    if (resume) {  // persist the match too: AI explanations and history work from saved matches
      const m = await api.createMatch(resume.id, j.id);
      const cache: MatchCache = { resumeId: resume.id, resumeName: resume.name, jobTitle: job.title, match: m, at: Date.now() };
      await setMatch(tabId, cache);
    }
    try { setSaved(await api.createApplication(j.id, resume?.id ?? null, status, notes)); }
    catch (e) { if (e instanceof ApiError && e.code === "duplicate_application") { setAlready(true); return; } throw e; }
  });
  const update = useAction(async (s: ApplicationStatus) => { if (!saved) return; setSaved(await api.updateApplication(saved.id, { status: s })); setStatus(s); });

  if (already) return <SuccessNote>You're already tracking this job. Its record was refreshed with the latest description.</SuccessNote>;
  if (saved) return (
    <div className="space-y-3">
      <SuccessNote><span><strong>Saved.</strong> “{saved.job.title}” is now tracked{resume ? ` with “${resume.name}”` : ""}.</span></SuccessNote>
      <Card><Select label="Update status" value={saved.status} onChange={(e) => void update.run(e.target.value as ApplicationStatus)} disabled={update.loading}>{STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</Select>
        {update.error && <div className="mt-2"><ErrorBanner message={update.error} /></div>}</Card>
    </div>);
  return (
    <Card className="space-y-3">
      <p className="text-ink-dim">Track <strong className="text-ink">{job.title}</strong>{job.company ? ` at ${job.company}` : ""}. The original posting link{job.url ? " is kept" : " isn't available (manual entry)"}.</p>
      <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>{STATUSES.slice(0, 4).map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</Select>
      <TextArea label="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {save.error && <ErrorBanner message={save.error} onRetry={() => void save.run()} />}
      <Button block loading={save.loading} icon={<Bookmark size={15} />} onClick={() => void save.run()}>Save to my applications</Button>
      <p className="text-[11px] text-ink-dim">Saving only records this job for you. ApplyPilot never applies or sends messages on your behalf.</p>
    </Card>
  );
}
