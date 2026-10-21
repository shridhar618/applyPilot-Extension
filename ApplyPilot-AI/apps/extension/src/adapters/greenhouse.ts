import type { JobAdapter } from "./types";
import { nodeToText, textOf, clean } from "./text";

/** Greenhouse-hosted boards (boards.greenhouse.io, job-boards.greenhouse.io, and embedded boards using the same markup). */
export const greenhouse: JobAdapter = {
  name: "greenhouse",
  matches: (u) => /(^|\.)greenhouse\.io$/.test(u.hostname),
  extract(doc) {
    const title = textOf(doc.querySelector(".app-title, h1.section-header, .job__title h1, h1"));
    const content = doc.querySelector("#content, .job__description, .job-post-content, [class*='job-description']");
    const og = doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content");
    // Classic pages title: "Job Application for <Title> at <Company>"
    const m = doc.title.match(/ at (.+)$/);
    return {
      title,
      company: clean(textOf(doc.querySelector(".company-name"))?.replace(/^at\s+/i, "") || og || m?.[1] || ""),
      location: textOf(doc.querySelector(".location, .job__location, [class*='location']")),
      description: content ? nodeToText(content) : "",
    };
  },
};
