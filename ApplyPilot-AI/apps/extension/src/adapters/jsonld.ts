import type { ExtractedJob } from "./types";
import { clean, htmlToText } from "./text";

type Obj = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

function findJobPostings(node: unknown, out: Obj[] = []): Obj[] {
  if (Array.isArray(node)) node.forEach((n) => findJobPostings(n, out));
  else if (isObj(node)) {
    const t = asArray(node["@type"]).map(String);
    if (t.includes("JobPosting")) out.push(node);
    if (node["@graph"]) findJobPostings(node["@graph"], out);
  }
  return out;
}

function location(jp: Obj): string {
  const parts = asArray(jp.jobLocation).flatMap((l) => {
    const a = isObj(l) && isObj(l.address) ? l.address : null;
    return a ? [[a.addressLocality, a.addressRegion, a.addressCountry].filter((x) => typeof x === "string" && x).join(", ")] : [];
  });
  const remote = String(jp.jobLocationType ?? "").toUpperCase() === "TELECOMMUTE" ? "Remote" : "";
  return [...parts, remote].filter(Boolean).join(" · ");
}

function salary(jp: Obj): string {
  const s = jp.baseSalary;
  if (!isObj(s)) return "";
  const v = isObj(s.value) ? s.value : s;
  const cur = typeof s.currency === "string" ? s.currency : "";
  const unit = typeof v.unitText === "string" ? `/${v.unitText.toLowerCase()}` : "";
  const range = v.minValue != null && v.maxValue != null ? `${v.minValue}–${v.maxValue}` : v.value != null ? String(v.value) : "";
  return range ? clean(`${cur} ${range}${unit}`) : "";
}

/** Reads schema.org JobPosting from <script type="application/ld+json">. Malformed blocks are skipped, never thrown. */
export function extractJsonLd(doc: Document): Partial<ExtractedJob> | null {
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try { data = JSON.parse(s.textContent ?? ""); } catch { continue; }
    const jp = findJobPostings(data)[0];
    if (!jp) continue;
    const org = jp.hiringOrganization;
    return {
      title: clean(typeof jp.title === "string" ? jp.title : ""),
      company: clean(isObj(org) ? String(org.name ?? "") : typeof org === "string" ? org : ""),
      location: location(jp),
      employmentType: asArray(jp.employmentType).map((x) => String(x).replace(/_/g, " ").toLowerCase()).join(", "),
      salaryText: salary(jp),
      description: typeof jp.description === "string" ? htmlToText(jp.description) : "",
    };
  }
  return null;
}
