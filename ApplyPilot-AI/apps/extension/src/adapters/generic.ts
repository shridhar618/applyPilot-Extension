import type { ExtractedJob } from "./types";
import { MIN_DESCRIPTION_CHARS } from "./types";
import { clean, nodeToText, textOf } from "./text";

const JOB_WORDS = /responsibilit|requirement|qualification|what you('|’)ll|experience with|we('|’)re looking|about the role|skills|benefits/i;

/** Last-resort heuristics for arbitrary career sites: pick the content block that reads most like a job description. */
export function extractGeneric(doc: Document): Partial<ExtractedJob> {
  const og = (p: string) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute("content") ?? "";
  const title = textOf(doc.querySelector("h1")) || clean(og("og:title")) || clean(doc.title.split(/[|\-–—]/)[0]);
  const candidates = Array.from(doc.querySelectorAll("main, article, [role='main'], [class*='job-description' i], [class*='description' i], [id*='job' i], section"));
  let best = "", bestScore = 0;
  for (const el of candidates) {
    const txt = nodeToText(el);
    if (txt.length < MIN_DESCRIPTION_CHARS || txt.length > 40_000) continue;
    const hits = (txt.match(new RegExp(JOB_WORDS.source, "gi")) ?? []).length;
    // Reward job-description vocabulary; mildly prefer shorter blocks so we don't grab the whole <body>.
    const score = hits * 1000 - txt.length / 50;
    if (hits > 0 && score > bestScore) { best = txt; bestScore = score; }
  }
  return { title, company: clean(og("og:site_name")), description: best };
}
