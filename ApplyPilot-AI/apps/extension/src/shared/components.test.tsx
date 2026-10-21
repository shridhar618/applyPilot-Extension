import type { MatchOut, ResumeSummary } from "@applypilot/shared-types";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChrome, mockFetch, signIn, USER } from "../test/chrome-mock";
import { Popup } from "../popup/Popup";
import { AuthForm } from "./components/AuthForm";
import { JobDetector } from "./components/JobPanel";
import { ExplainWithAI, MatchView } from "./components/MatchView";
import { ResumesView } from "./components/ResumesView";
import { SaveJobView } from "./components/SaveJobView";
import type { JobDraft, JobState } from "./storage";
import { getAuth } from "./storage";

let env: ReturnType<typeof installChrome>;
beforeEach(() => { env = installChrome(); });

const TAB = { id: 7, url: "https://careers.acme.example/jobs/1", title: "Job" };
const JOB: JobDraft = { title: "Data Engineer Intern", company: "Acme", location: "Bengaluru", employmentType: "", salaryText: "", description: "x".repeat(300), url: TAB.url, adapter: "greenhouse", confidence: "medium", source: "auto" };
const RESUME: ResumeSummary = { id: 3, name: "Main resume", original_filename: "cv.pdf", size_bytes: 20_000, is_default: true, has_file: true, created_at: "", updated_at: "" };
const MATCH: MatchOut = {
  id: 11, resume_id: 3, job_id: 5, score: 61, created_at: null,
  result: { label: "Estimated resume-to-job compatibility (not an official ATS score)", score: 61, semantic_method: "lexical cosine (TF unigram+bigram)", strengths: ["1 job skill(s) are backed by experience or project text: Python."],
    concerns: ["'AWS' is required but doesn't appear on your resume."], recommended_actions: ["If you genuinely have AWS experience, add it where truthful."], notes: ["Weights are configurable starting assumptions, not validated against real hiring outcomes."],
    components: [
      { key: "required_skills", label: "Required skill coverage", weight: 0.35, effective_weight: 0.5, value: 0.57, assessable: true, detail: "2/3 required skills appear on your resume." },
      { key: "experience", label: "Experience alignment", weight: 0.15, effective_weight: 0, value: null, assessable: false, detail: "The posting states no minimum experience." }],
    skill_findings: [
      { skill: "Python", requirement: "required", status: "evidenced", evidence: "Built ETL pipelines with Python and Airflow." },
      { skill: "SQL", requirement: "required", status: "stated", evidence: null },
      { skill: "AWS", requirement: "required", status: "absent", evidence: null },
      { skill: "Spark", requirement: "mentioned", status: "absent", evidence: null }] },
};

describe("AuthForm", () => {
  it("signs in and stores the session", async () => {
    const f = mockFetch(() => ({ body: { access_token: "T9", token_type: "bearer", expires_in: 3600, user: USER } }));
    render(<AuthForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(async () => expect((await getAuth())?.token).toBe("T9"));
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ email: "a@example.com", password: "hunter2hunter2" });
  });

  it("shows the server's error in an alert", async () => {
    mockFetch(() => ({ status: 401, body: { error: { code: "invalid_credentials", message: "Incorrect email or password.", details: null } } }));
    render(<AuthForm />);
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("blocks registration with a short password", async () => {
    const f = mockFetch(() => ({}));
    render(<AuthForm />);
    await userEvent.click(screen.getByRole("button", { name: /create an account/i }));
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("JobDetector", () => {
  it("explains and requests per-site permission, then retries extraction", async () => {
    const state: JobState = { status: "needs_permission", origin: "https://careers.acme.example" };
    env.chrome.runtime.sendMessage.mockResolvedValue({ ok: true, state: { status: "ready", job: JOB } });
    render(<JobDetector tab={TAB} state={state} />);
    expect(screen.getByText(/never browsing history/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Allow on this site" }));
    expect(env.chrome.permissions.request).toHaveBeenCalledWith({ origins: ["https://careers.acme.example/*"] });
    await waitFor(() => expect(env.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "EXTRACT_JOB", tabId: 7 }));
  });

  it("does not extract if the user declines the permission", async () => {
    env.chrome.permissions.request.mockResolvedValue(false);
    render(<JobDetector tab={TAB} state={{ status: "needs_permission", origin: "https://careers.acme.example" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Allow on this site" }));
    await waitFor(() => expect(env.chrome.permissions.request).toHaveBeenCalled());
    expect(env.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("shows a friendly message when nothing is found and lets the user paste a job manually", async () => {
    render(<JobDetector tab={TAB} state={{ status: "not_found" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't find a job posting/i);
    await userEvent.click(screen.getByRole("button", { name: "Paste job description" }));
    const submit = screen.getByRole("button", { name: "Use this job" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Job title/), "Backend Engineer");
    await userEvent.type(screen.getByLabelText(/Job description/), "Requirements\n- Python and SQL\n- 2 years of experience");
    await userEvent.click(submit);
    await waitFor(() => expect(env.session.data["job:7"]).toMatchObject({ status: "ready", job: { title: "Backend Engineer", source: "manual", adapter: null } }));
  });

  it("explains unsupported pages", () => {
    render(<JobDetector tab={{ ...TAB, url: "chrome://extensions" }} state={{ status: "unsupported", reason: "Browser pages can't be analyzed." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Browser pages can't be analyzed.");
  });
});

describe("MatchView", () => {
  it("shows the estimated score with the not-an-ATS disclaimer", () => {
    render(<MatchView match={MATCH} />);
    expect(screen.getByRole("img", { name: /Estimated compatibility 61 out of 100/ })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "P" && /is not an official ATS score/i.test(el.textContent ?? ""))).toBeInTheDocument();
  });

  it("explains each component and flags non-assessable ones instead of scoring them zero", () => {
    render(<MatchView match={MATCH} />);
    expect(screen.getByText("Required skill coverage")).toBeInTheDocument();
    expect(screen.getByText(/57% × 50% weight/)).toBeInTheDocument();
    expect(screen.getByText(/Not assessable · weight redistributed/)).toBeInTheDocument();
  });

  it("distinguishes evidenced / listed / not found and quotes resume evidence", () => {
    render(<MatchView match={MATCH} />);
    expect(screen.getByText("Evidenced")).toBeInTheDocument();
    expect(screen.getByText("Listed")).toBeInTheDocument();
    expect(screen.getAllByText("Not found").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Built ETL pipelines with Python/)).toBeInTheDocument();
    expect(screen.getByText("Mentioned (not scored)")).toBeInTheDocument();
  });
});

describe("ExplainWithAI", () => {
  it("asks for consent first and sends nothing until the user agrees", async () => {
    await signIn(env.local);
    const f = mockFetch((url) => url.endsWith("/auth/me") ? { body: { ...USER, ai_consent: true } } : { body: { summary: "Solid base.", top_priorities: ["Document SQL usage"], caveats: [] } });
    render(<ExplainWithAI matchId={11} consent={false} onConsent={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /Explain this score with AI/ }));
    expect(screen.getByText(/Send your resume and this job to your AI provider/)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "I agree, explain" }));
    expect(await screen.findByText("Solid base.")).toBeInTheDocument();
    expect(f.mock.calls.map((c) => c[0])).toEqual(["http://localhost:8000/api/v1/auth/me", "http://localhost:8000/api/v1/matches/11/explain"]);
  });

  it("shows the actionable setup message when no provider is configured", async () => {
    await signIn(env.local);
    mockFetch(() => ({ status: 503, body: { error: { code: "ai_not_configured", message: "AI features need a provider. Set APPLYPILOT_AI_PROVIDER.", details: null } } }));
    render(<ExplainWithAI matchId={11} consent onConsent={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /Explain this score/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("APPLYPILOT_AI_PROVIDER");
  });

  it("needs a saved match", () => {
    render(<ExplainWithAI matchId={null} consent onConsent={() => undefined} />);
    expect(screen.getByText(/Save this job/)).toBeInTheDocument();
  });
});

describe("ResumesView", () => {
  const props = { resumes: [] as ResumeSummary[], loading: false, error: null, reload: vi.fn(async () => undefined), select: vi.fn() };

  it("shows an empty state", () => {
    render(<ResumesView {...props} />);
    expect(screen.getByText("No resumes yet")).toBeInTheDocument();
  });

  it("rejects oversized files before any network call", async () => {
    const f = mockFetch(() => ({}));
    await signIn(env.local);
    render(<ResumesView {...props} />);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Upload resume file"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent(/over 5 MB/);
    expect(f).not.toHaveBeenCalled();
  });

  it("uploads a file as multipart and reloads", async () => {
    await signIn(env.local);
    const f = mockFetch(() => ({ status: 201, body: { id: 9, name: "cv", parsed: { warnings: ["Few section headings were detected."] } } }));
    render(<ResumesView {...props} />);
    await userEvent.upload(screen.getByLabelText("Upload resume file"), new File(["%PDF-1.4 hi"], "cv.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(props.reload).toHaveBeenCalled());
    expect((f.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(props.select).toHaveBeenCalledWith(9);
    expect(await screen.findByText(/Few section headings/)).toBeInTheDocument();
  });

  it("requires confirmation before deleting", async () => {
    await signIn(env.local);
    const f = mockFetch(() => ({ status: 204 }));
    render(<ResumesView {...props} resumes={[RESUME]} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Main resume" }));
    expect(f).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("http://localhost:8000/api/v1/resumes/3", expect.objectContaining({ method: "DELETE" })));
  });
});

describe("SaveJobView", () => {
  it("saves the job, records the match and the tracked application", async () => {
    await signIn(env.local);
    const f = mockFetch((url) =>
      url.endsWith("/jobs") ? { status: 201, body: { id: 5 } } :
      url.endsWith("/matches") ? { status: 201, body: MATCH } :
      { status: 201, body: { id: 21, status: "saved", job: { id: 5, title: JOB.title } } });
    render(<SaveJobView job={JOB} resume={RESUME} tabId={7} />);
    await userEvent.click(screen.getByRole("button", { name: /Save to my applications/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Saved/);
    expect(f.mock.calls.map((c) => (c[0] as string).split("/api/v1")[1])).toEqual(["/jobs", "/matches", "/applications"]);
    expect(env.session.data["match:7"]).toMatchObject({ match: { id: 11 } });
  });

  it("tells the user when the job is already tracked", async () => {
    await signIn(env.local);
    mockFetch((url) => url.endsWith("/jobs") ? { status: 200, body: { id: 5 } } : url.endsWith("/matches") ? { status: 201, body: MATCH } :
      { status: 409, body: { error: { code: "duplicate_application", message: "dup", details: null } } });
    render(<SaveJobView job={JOB} resume={RESUME} tabId={7} />);
    await userEvent.click(screen.getByRole("button", { name: /Save to my applications/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(/already tracking/);
  });

  it("prevents double submission while a save is in flight", async () => {
    await signIn(env.local);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const f = mockFetch(async (url) => { if (url.endsWith("/jobs")) await gate; return url.endsWith("/jobs") ? { status: 201, body: { id: 5 } } : url.endsWith("/matches") ? { status: 201, body: MATCH } : { status: 201, body: { id: 1, status: "saved", job: { id: 5, title: "t" } } }; });
    render(<SaveJobView job={JOB} resume={RESUME} tabId={7} />);
    const btn = screen.getByRole("button", { name: /Save to my applications/ });
    await userEvent.click(btn); await userEvent.click(btn);
    release();
    await screen.findByRole("status");
    expect(f.mock.calls.filter((c) => (c[0] as string).endsWith("/jobs"))).toHaveLength(1);
  });
});

describe("Popup", () => {
  it("shows sign-in when signed out", async () => {
    render(<Popup />);
    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
  });

  it("analyzes a detected job against the selected resume and shows the score", async () => {
    await signIn(env.local);
    await env.session.set({ "job:7": { status: "ready", job: JOB } });
    const f = mockFetch((url) => url.includes("/resumes") ? { body: { items: [RESUME], total: 1, limit: 100, offset: 0 } } : { body: MATCH });
    render(<Popup />);
    expect(await screen.findByText("Data Engineer Intern")).toBeInTheDocument();
    expect(screen.getByText(/Detected automatically · greenhouse/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Calculate estimated match" }));
    const ring = await screen.findByRole("img", { name: /Estimated compatibility 61/ });
    const card = ring.closest("section")!;
    expect(within(card).getByText("Not an official ATS score.")).toBeInTheDocument();
    expect(within(card).getByText("2/3 required skills found")).toBeInTheDocument();
    const preview = f.mock.calls.find((c) => (c[0] as string).endsWith("/matches/preview"))!;
    expect(JSON.parse((preview[1] as RequestInit).body as string)).toMatchObject({ resume_id: 3, job: { title: "Data Engineer Intern", source: "auto", adapter: "greenhouse" } });
  });

  it("labels manually entered jobs as such", async () => {
    await signIn(env.local);
    await env.session.set({ "job:7": { status: "ready", job: { ...JOB, source: "manual", adapter: null, confidence: null } } });
    mockFetch(() => ({ body: { items: [RESUME], total: 1, limit: 100, offset: 0 } }));
    render(<Popup />);
    expect(await screen.findByText("Entered manually")).toBeInTheDocument();
  });

  it("opens the side panel for the active tab", async () => {
    await signIn(env.local);
    mockFetch(() => ({ body: { items: [], total: 0, limit: 100, offset: 0 } }));
    vi.spyOn(window, "close").mockImplementation(() => undefined);
    render(<Popup />);
    await userEvent.click(await screen.findByRole("button", { name: "Open side panel" }));
    await waitFor(() => expect(env.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 }));
  });
});
