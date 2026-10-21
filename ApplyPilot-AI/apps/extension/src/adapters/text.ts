/** HTML/DOM -> readable plain text with list and paragraph structure preserved (headings like "Requirements" stay on their own line). */
const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "TR", "BR", "HR"]);

export function nodeToText(root: Node): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) { out.push((n.textContent ?? "").replace(/\s+/g, " ")); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME", "BUTTON", "FORM"].includes(el.tagName.toUpperCase())) return;
    const isBlock = BLOCK.has(el.tagName.toUpperCase());
    if (el.tagName === "LI") out.push("\n- ");
    else if (isBlock) out.push("\n");
    el.childNodes.forEach(walk);
    if (isBlock && el.tagName !== "LI") out.push("\n");
  };
  walk(root);
  return tidy(out.join(""));
}

export function htmlToText(html: string): string {
  // JSON-LD descriptions are sometimes entity-encoded HTML ("&lt;p&gt;..."), so decode once if no tags are present.
  const parse = (s: string) => new DOMParser().parseFromString(s, "text/html");
  let doc = parse(html);
  if (!/<[a-z][\s\S]*>/i.test(html) && /&lt;[a-z]/i.test(html)) doc = parse(doc.body.textContent ?? "");
  return nodeToText(doc.body);
}

export function tidy(s: string): string {
  return s.replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
export const textOf = (el: Element | null | undefined) => clean(el?.textContent);
