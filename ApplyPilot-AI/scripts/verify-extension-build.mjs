// Verifies the unpacked extension build is loadable: valid MV3 manifest, every referenced file exists,
// HTML entry points resolve their scripts/styles, and no dev-server URLs leaked into the bundle.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "apps/extension/dist");
const errors = [];
const need = (rel, why) => { if (!existsSync(join(dist, rel))) errors.push(`missing ${rel} (${why})`); };

if (!existsSync(join(dist, "manifest.json"))) { console.error(`✗ ${dist}/manifest.json not found`); process.exit(1); }
const m = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
if (m.manifest_version !== 3) errors.push("manifest_version must be 3");
for (const k of ["name", "version", "description"]) if (!m[k]) errors.push(`manifest.${k} missing`);
if ((m.description ?? "").length > 132) errors.push("description exceeds Chrome Web Store 132-char limit");

need(m.background?.service_worker ?? "", "background.service_worker");
need(m.action?.default_popup ?? "", "action.default_popup");
need(m.side_panel?.default_path ?? "", "side_panel.default_path");
for (const p of Object.values(m.icons ?? {})) need(p, "icons");
for (const p of Object.values(m.action?.default_icon ?? {})) need(p, "action.default_icon");
for (const p of ["content.js"]) need(p, "injected content script");
for (const perm of m.permissions ?? []) if (["tabs", "history", "cookies", "webRequest", "<all_urls>"].includes(perm)) errors.push(`over-broad permission: ${perm}`);
if ((m.host_permissions ?? []).some((h) => h === "<all_urls>" || h === "https://*/*" || h === "http://*/*")) errors.push("host_permissions must not be broad; use optional_host_permissions");

for (const html of [m.action?.default_popup, m.side_panel?.default_path].filter(Boolean)) {
  const src = readFileSync(join(dist, html), "utf8");
  for (const [, ref] of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|data:|#)/.test(ref)) { if (/^https?:/.test(ref)) errors.push(`${html} references remote URL ${ref}`); continue; }
    need(ref.replace(/^\.\//, ""), `${html} reference`);
  }
}
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(dist).filter((f) => /\.(js|html|css)$/.test(f))) {
  const t = readFileSync(f, "utf8");
  if (/localhost:5173|@vite\/client|\/@react-refresh/.test(t)) errors.push(`dev-server reference in ${f.replace(dist + "/", "")}`);
  if (/\bsk-[A-Za-z0-9]{20,}/.test(t)) errors.push(`possible API key in ${f.replace(dist + "/", "")}`);
}
if (errors.length) { console.error("✗ extension build verification failed:\n  - " + errors.join("\n  - ")); process.exit(1); }
console.log(`✓ extension build verified: MV3 manifest valid, ${walk(dist).length} files, all references resolve → ${dist}`);
