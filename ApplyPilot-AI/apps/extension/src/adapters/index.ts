import type { ExtractedJob, JobAdapter } from "./types";
import { MIN_DESCRIPTION_CHARS } from "./types";
import { clean } from "./text";
import { extractGeneric } from "./generic";
import { greenhouse } from "./greenhouse";
import { extractJsonLd } from "./jsonld";
import { lever } from "./lever";

export type { ExtractedJob } from "./types";
export { MIN_DESCRIPTION_CHARS } from "./types";

/** Site-specific adapters. Add a new site by adding a JobAdapter here; nothing else needs to change. */
export const ADAPTERS: JobAdapter[] = [greenhouse, lever];

const pick = (...vals: (string | undefined)[]) => vals.map((v) => clean(v)).find(Boolean) ?? "";
const safe = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };

const TRACKING = /^(utm_.*|gclid|fbclid|msclkid|mc_[a-z]+|ref|referrer|source|src|trk|trackingid|refid|gh_src|lever-source|lever-origin)$/i;

/** Remove the fragment and known tracking params, but KEEP identifying params (e.g. ?gh_jid=123 or ?currentJobId=...). */
export function canonicalUrl(u: URL): string {
  const c = new URL(u.href);
  c.hash = "";
  for (const k of Array.from(c.searchParams.keys())) if (TRACKING.test(k)) c.searchParams.delete(k);
  return c.toString();
}

export function isUsable(j: Pick<ExtractedJob, "title" | "description">): boolean {
  return j.title.length > 0 && j.description.length >= MIN_DESCRIPTION_CHARS;
}

/**
 * Resilient extraction: structured data (JSON-LD) first, then the site adapter's scoped selectors, then generic heuristics.
 * Fields are merged so a layout change that breaks one source degrades gracefully instead of failing the whole page.
 * Returns null when nothing usable was found -- callers must then offer manual entry.
 */
export function extractJob(doc: Document, urlStr: string): ExtractedJob | null {
  let url: URL;
  try { url = new URL(urlStr); } catch { return null; }
  const adapter = ADAPTERS.find((a) => a.matches(url));
  const ld = safe(() => extractJsonLd(doc));
  const site = adapter ? safe(() => adapter.extract(doc, url)) : null;
  const needGeneric = !(ld?.description && ld.description.length >= MIN_DESCRIPTION_CHARS) && !(site?.description && site.description.length >= MIN_DESCRIPTION_CHARS);
  const gen = needGeneric ? safe(() => extractGeneric(doc)) : null;

  const job: ExtractedJob = {
    title: pick(ld?.title, site?.title, gen?.title),
    company: pick(ld?.company, site?.company, gen?.company),
    location: pick(ld?.location, site?.location),
    employmentType: pick(ld?.employmentType, site?.employmentType),
    salaryText: pick(ld?.salaryText, site?.salaryText),
    description: [ld?.description, site?.description, gen?.description].find((d) => (d?.length ?? 0) >= MIN_DESCRIPTION_CHARS) ?? "",
    url: canonicalUrl(url),
    adapter: adapter?.name ?? "generic",
    confidence: ld?.description ? "high" : site?.description ? "medium" : "low",
  };
  if (ld?.description && adapter) job.adapter = adapter.name;
  else if (ld?.description) job.adapter = "structured-data";
  return isUsable(job) ? job : null;
}
