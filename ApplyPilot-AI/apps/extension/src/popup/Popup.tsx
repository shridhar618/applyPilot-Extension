import { PanelRight, Settings as Cog } from "lucide-react";
import { runMatch } from "../shared/analysis";
import { AuthForm } from "../shared/components/AuthForm";
import { JobDetector, JobSummary } from "../shared/components/JobPanel";
import { useActiveTab, useAction, useAuth, useJobState, useMatchCache, useResumes } from "../shared/hooks";
import { requestPanelTab } from "../shared/storage";
import { Button, Card, ErrorBanner, Logo, ScoreRing, Select, Skeleton } from "../shared/ui";

/** Compact quick-action surface. The full experience (breakdown, evidence, saving) lives in the side panel. */
export function Popup() {
  const [auth, authLoading] = useAuth();
  const tab = useActiveTab();
  const [state] = useJobState(tab?.id ?? null);
  const [cache] = useMatchCache(tab?.id ?? null);
  const res = useResumes(!!auth);
  const resume = res.resumes.find((r) => r.id === res.selectedId) ?? null;
  const job = state.status === "ready" ? state.job : null;
  const analyze = useAction(async () => { if (tab && resume && job) await runMatch(tab.id, resume, job); });

  const openPanel = async (to?: string) => {
    if (!tab) return;
    if (to) await requestPanelTab(to);
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  };

  return (
    <div className="space-y-3 p-3.5">
      <header className="flex items-center justify-between"><Logo size={24} />
        <Button variant="ghost" aria-label="Settings" className="!h-8 !w-8 !px-0" icon={<Cog size={16} />} onClick={() => void openPanel("settings")} /></header>

      {authLoading ? <Skeleton className="h-32" /> : !auth ? <Card><AuthForm compact /></Card> : (<>
        {!job ? <JobDetector tab={tab} state={state} compact /> : <JobSummary job={job} />}

        {job && (res.loading ? <Skeleton className="h-9" /> : res.resumes.length === 0 ? (
          <ErrorBanner tone="warn" message="Add a resume to compare it with this job." />
        ) : (
          <Select label="Resume" value={res.selectedId ?? ""} onChange={(e) => res.select(Number(e.target.value))}>{res.resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        ))}
        {res.error && <ErrorBanner message={res.error} onRetry={() => void res.reload()} />}

        {job && !analyze.loading && (!cache || cache.resumeId !== resume?.id) && <Button block disabled={!resume} onClick={() => void analyze.run()}>Calculate estimated match</Button>}
        {analyze.loading && <Skeleton className="h-28" />}
        {analyze.error && <ErrorBanner message={analyze.error} onRetry={() => void analyze.run()} />}
        {cache && cache.resumeId === resume?.id && !analyze.loading && (
          <Card className="flex items-center gap-3"><ScoreRing score={cache.match.score} size={84} />
            <div className="min-w-0 flex-1 text-[12px]"><p className="font-medium">Estimated match</p>
              <p className="text-ink-dim">{cache.match.result.skill_findings.filter((f) => f.requirement === "required" && f.status !== "absent").length}/{cache.match.result.skill_findings.filter((f) => f.requirement === "required").length} required skills found</p>
              <p className="mt-1 text-[11px] text-ink-dim">Not an official ATS score.</p></div></Card>)}

        <Button block variant="subtle" icon={<PanelRight size={15} />} onClick={() => void openPanel(job ? "match" : undefined)}>{job ? "Details & save in side panel" : "Open side panel"}</Button>
      </>)}
    </div>
  );
}
