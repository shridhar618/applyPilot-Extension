import type { JobAdapter } from "./types";
import { nodeToText, textOf, clean } from "./text";

/** Lever-hosted postings (jobs.lever.co/<company>/<id>). */
export const lever: JobAdapter = {
  name: "lever",
  matches: (u) => u.hostname === "jobs.lever.co" || u.hostname.endsWith(".lever.co"),
  extract(doc, url) {
    const title = textOf(doc.querySelector(".posting-headline h2, [data-qa='posting-name'], h2"));
    const sections = Array.from(doc.querySelectorAll(".section-wrapper .section, [data-qa='job-description'], .posting-page .content .section"));
    const body = sections.length ? sections.map(nodeToText).join("\n\n") : "";
    const logoAlt = doc.querySelector(".main-header-logo img")?.getAttribute("alt") ?? "";
    const slug = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return {
      title,
      company: clean(logoAlt.replace(/\s*logo$/i, "")) || slug.replace(/-/g, " "),
      location: textOf(doc.querySelector(".posting-categories .location, [data-qa='posting-location']")),
      employmentType: textOf(doc.querySelector(".posting-categories .commitment")).replace(/\s*\/\s*$/, ""),
      description: body,
    };
  },
};
