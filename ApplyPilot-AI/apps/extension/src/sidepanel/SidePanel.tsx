import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bookmark, CheckCircle2, Circle, FileText, LayoutDashboard, Settings as Cog, Target } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../shared/api";
import { runMatch } from "../shared/analysis";
import { AuthForm } from "../shared/components/AuthForm";
import { JobDetector, JobSummary, ManualJobForm } from "../shared/components/JobPanel";
import { ExplainWithAI, MatchSkeleton, MatchView } from "../shared/components/MatchView";
import { ResumesView } from "../shared/components/ResumesView";
import { SaveJobView } from "../shared/components/SaveJobView";
import { SettingsView } from "../shared/components/SettingsView";
import { useActiveTab, useAction, useAuth, useJobState, useMatchCache, useResumes } from "../shared/hooks";
import { Badge, Button, Card, EmptyState, ErrorBanner, Logo, Mono, SectionTitle, Select, Skeleton, Tabs } from "../shared/ui";

type TabId = "overview" | "match" | "save" | "resumes" | "settings";
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={13} /> },
  { id: "match", label: "Job Match", icon: <Target size={13} /> },
  { id: "save", label: "Save Job", icon: <Bookmark size={13} /> },
  { id: "resumes", label: "Resumes", icon: <FileText size={13} /> },
  { id: "settings", label: "Settings", icon: <Cog size={13} /> },
];

export function SidePanel() {
  const [tab, setTab] = useState<TabId>("overview");
  const [auth, authLoading] = useAuth();
  const active = useActiveTab();
  const [jobState] = useJobState(active?.id ?? null);
  const [cache] = useMatchCache(active?.id ?? null);
  const res = useResumes(!!auth);
  const reduce = useReducedMotion();

  // The popup can deep-link into a tab (e.g. Settings) through session storage.
  useEffect(() => {
    const apply = (v: unknown) => { if (typeof v === "string" && TABS.some((t) => t.id === v)) { setTab(v as TabId); void chrome.storage.session.remove("panelTab"); } };
    void chrome.storage.session.get("panelTab").then((r) => apply(r.panelTab));
    const l = (c: Record<string, chrome.storage.StorageChange>, a: string) => { if (a === "session" && c.panelTab?.newValue) apply(c.panelTab.newValue); };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);

  const resume = res.resumes.find((r) => r.id === res.selectedId) ?? null;
  const job = jobState.status === "ready" ? jobState.job : null;

  let body: ReactNode;
  if (authLoading) body = <Skeleton className="h-40" />;
  else if (!auth && tab !== "settings") body = <Card><AuthForm /></Card>;
  else if (tab === "overview") body = <Overview auth={!!auth} name={auth?.user.full_name || auth?.user.email || ""} resumeCount={res.resumes.length} hasResume={!!resume} job={job} score={cache?.match.score ?? null} go={setTab} active={active} jobState={jobState} />;
  else if (tab === "match") body = <MatchTab active={active} jobState={jobState} resumes={res} resumeName={resume?.name} cache={cache} consent={auth?.user.ai_consent ?? false} />;
  else if (tab === "save") body = !job || !active ? <EmptyState icon={<Bookmark size={18} />} title="Nothing to save yet">Analyze a job posting first, then save it here.</EmptyState> : <SaveJobView key={job.url + job.title} job={job} resume={resume} tabId={active.id} />;
  else if (tab === "resumes") body = <ResumesView {...res} />;
  else body = <SettingsView user={auth?.user ?? null} />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-3.5 py-3"><Logo />{auth && <Badge tone="neutral">{auth.user.email}</Badge>}</header>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <main role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>{body}</motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Step({ done, children, onClick }: { done: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <li><button disabled={done || !onClick} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-sm p-1.5 text-left hover:bg-elevated disabled:hover:bg-transparent">
      {done ? <CheckCircle2 size={16} className="text-ok" aria-label="Done" /> : <Circle size={16} className="text-ink-dim" aria-label="To do" />}
      <span className={done ? "text-ink-dim line-through" : ""}>{children}</span></button></li>
  );
}

function Overview({ auth, name, resumeCount, hasResume, job, score, go, active, jobState }: { auth: boolean; name: string; resumeCount: number; hasResume: boolean; job: ReturnType<typeof Object>; score: number | null; go: (t: TabId) => void; active: ReturnType<typeof useActiveTab>; jobState: ReturnType<typeof useJobState>[0] }) {
  const [apps, setApps] = useState<{ total: number } | null>(null);
  useEffect(() => { if (auth) api.listApplications(1).then(setApps, () => setApps(null)); }, [auth]);
  return (
    <div className="space-y-3">
      <div><h1 className="font-display text-[18px] font-bold leading-tight">{name ? `Hi, ${name.split(" ")[0].split("@")[0]}` : "Welcome"}</h1><p className="text-ink-dim">Find better jobs. Build stronger resumes. Apply smarter.</p></div>
      <Card>
        <SectionTitle>Get started</SectionTitle>
        <ul>
          <Step done={auth}>Sign in</Step>
          <Step done={hasResume} onClick={() => go("resumes")}>Add your resume</Step>
          <Step done={!!job} onClick={() => go("match")}>Analyze a job posting</Step>
          <Step done={score != null} onClick={() => go("match")}>See your estimated match</Step>
        </ul>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[["Resumes", resumeCount], ["Tracked jobs", apps?.total ?? "–"], ["Match", score != null ? Math.round(score) : "–"]].map(([l, v]) => (
          <Card key={l as string} className="!p-2.5 text-center"><p className="font-mono text-[20px] font-medium"><Mono>{v}</Mono></p><p className="text-[11px] text-ink-dim">{l}</p></Card>))}
      </div>
      {job && <JobSummary job={job as never} />}
      {!job && active && jobState.status === "idle" && <p className="text-center text-[12px] text-ink-dim">Open a job posting and head to Job Match.</p>}
    </div>
  );
}

function MatchTab({ active, jobState, resumes, resumeName, cache, consent }: { active: ReturnType<typeof useActiveTab>; jobState: ReturnType<typeof useJobState>[0]; resumes: ReturnType<typeof useResumes>; resumeName?: string; cache: ReturnType<typeof useMatchCache>[0]; consent: boolean }) {
  const [editing, setEditing] = useState(false);
  const [consented, setConsented] = useState(consent);
  const job = jobState.status === "ready" ? jobState.job : null;
  const resume = resumes.resumes.find((r) => r.id === resumes.selectedId) ?? null;
  const analyze = useAction(async () => { if (active && resume && job) await runMatch(active.id, resume, job); });
  const stale = cache && resume && (cache.resumeId !== resume.id || cache.jobTitle !== job?.title);

  if (!job || !active) return <JobDetector tab={active} state={jobState} />;
  if (editing) return <Card><ManualJobForm tab={active} initial={job} onDone={() => setEditing(false)} /></Card>;
  return (
    <div className="space-y-3">
      <JobSummary job={job} onEdit={() => setEditing(true)} />
      {resumes.loading ? <Skeleton className="h-9" /> : resumes.resumes.length === 0 ? (
        <ErrorBanner tone="warn" message="Add a resume in the Resumes tab to see how well you match." />
      ) : (
        <Select label="Compare with resume" value={resumes.selectedId ?? ""} onChange={(e) => resumes.select(Number(e.target.value))}>
          {resumes.resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_default ? " (default)" : ""}</option>)}
        </Select>)}
      {!cache || stale ? <Button block disabled={!resume} loading={analyze.loading} onClick={() => void analyze.run()}>Calculate estimated match{resumeName ? ` with ${resumeName}` : ""}</Button> : null}
      {analyze.error && <ErrorBanner message={analyze.error} onRetry={() => void analyze.run()} />}
      {analyze.loading && <MatchSkeleton />}
      {cache && !analyze.loading && (<>
        <MatchView match={cache.match} onRerun={() => void analyze.run()} />
        <ExplainWithAI matchId={cache.match.id} consent={consented} onConsent={() => setConsented(true)} />
      </>)}
    </div>
  );
}
