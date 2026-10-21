import { describe, expect, it } from "vitest";
import { canonicalUrl, extractJob, isUsable } from "./index";
import { BROKEN_JSONLD_THEN_GREENHOUSE, GENERIC_PAGE, JSONLD_GRAPH_ENCODED, JSONLD_PAGE, LEVER_PAGE, NOT_A_JOB_PAGE, TINY_PAGE } from "./__fixtures__/pages";

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("job extraction", () => {
  it("prefers schema.org JSON-LD and maps all fields", () => {
    const j = extractJob(doc(JSONLD_PAGE), "https://careers.acme.example/jobs/42?utm_source=x#apply")!;
    expect(j).toMatchObject({ title: "Data Engineer Intern", company: "Acme Analytics", location: "Bengaluru, KA, IN", employmentType: "intern, full time", confidence: "high", adapter: "structured-data" });
    expect(j.salaryText).toBe("INR 30000–40000/month");
    expect(j.description).toContain("Requirements");
    expect(j.description).toContain("- Python and SQL"); // list structure survives so the backend can classify sections
    expect(j.url).toBe("https://careers.acme.example/jobs/42"); // tracking param + fragment removed
  });

  it("handles @graph, array @type, string organisation, remote flag and entity-encoded HTML", () => {
    const j = extractJob(doc(JSONLD_GRAPH_ENCODED), "https://x.example/job")!;
    expect(j.title).toBe("ML Engineer");
    expect(j.company).toBe("Beta AI");
    expect(j.location).toBe("Remote");
    expect(j.description).toContain("- PyTorch");
    expect(j.description).not.toContain("&lt;");
  });

  it("skips malformed JSON-LD and falls back to the Greenhouse adapter", () => {
    const j = extractJob(doc(BROKEN_JSONLD_THEN_GREENHOUSE), "https://boards.greenhouse.io/gamma/jobs/1")!;
    expect(j).toMatchObject({ title: "Backend Engineer", company: "Gamma Corp", location: "Remote - India", adapter: "greenhouse", confidence: "medium" });
    expect(j.description).toContain("- PostgreSQL");
  });

  it("extracts from the Lever adapter", () => {
    const j = extractJob(doc(LEVER_PAGE), "https://jobs.lever.co/delta/abc-123")!;
    expect(j).toMatchObject({ title: "Platform Engineer", company: "Delta", location: "Bangalore", employmentType: "Full-time", adapter: "lever" });
    expect(j.description).toContain("Terraform");
  });

  it("uses generic heuristics on unknown sites and marks them low confidence", () => {
    const j = extractJob(doc(GENERIC_PAGE), "https://epsilon.example/careers/frontend")!;
    expect(j).toMatchObject({ title: "Frontend Developer", company: "Epsilon Labs", adapter: "generic", confidence: "low" });
    expect(j.description).toContain("Requirements");
    expect(j.description).not.toContain("Copyright Epsilon");
  });

  it("returns null instead of guessing when a page isn't a job posting", () => {
    expect(extractJob(doc(NOT_A_JOB_PAGE), "https://blog.example/post")).toBeNull();
    expect(extractJob(doc(TINY_PAGE), "https://x.example/")).toBeNull();
  });

  it("never throws on hostile or empty input", () => {
    expect(extractJob(doc(""), "https://x.example/")).toBeNull();
    expect(extractJob(doc(JSONLD_PAGE), "not a url")).toBeNull();
  });

  it("ignores scripts/styles/forms inside descriptions", () => {
    const html = JSONLD_PAGE.replace("</head>", "</head>").replace("</body>", "<script>alert(1)</script></body>");
    expect(extractJob(doc(html), "https://x.example/j")!.description).not.toContain("alert(1)");
  });
});

describe("canonicalUrl", () => {
  it("keeps identifying params but strips tracking", () => {
    expect(canonicalUrl(new URL("https://co.example/careers?gh_jid=123&utm_campaign=a&gclid=z#x"))).toBe("https://co.example/careers?gh_jid=123");
  });
  it("different job ids stay different", () => {
    expect(canonicalUrl(new URL("https://co.example/c?gh_jid=1"))).not.toBe(canonicalUrl(new URL("https://co.example/c?gh_jid=2")));
  });
});

describe("isUsable", () => {
  it("requires a title and a substantial description", () => {
    expect(isUsable({ title: "", description: "x".repeat(500) })).toBe(false);
    expect(isUsable({ title: "T", description: "short" })).toBe(false);
    expect(isUsable({ title: "T", description: "x".repeat(500) })).toBe(true);
  });
});
