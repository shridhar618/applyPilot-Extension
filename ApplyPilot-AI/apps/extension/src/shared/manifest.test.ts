import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));

describe("manifest.json", () => {
  it("is Manifest V3 with required fields", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name && manifest.version && manifest.description).toBeTruthy();
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });
  it("requests only the minimum permissions", () => {
    expect([...manifest.permissions].sort()).toEqual(["activeTab", "contextMenus", "scripting", "sidePanel", "storage"]);
    for (const bad of ["tabs", "history", "cookies", "webRequest", "<all_urls>"]) expect(manifest.permissions).not.toContain(bad);
  });
  it("keeps broad site access optional and only declares local dev hosts up front", () => {
    expect(manifest.host_permissions).toEqual(["https://api.example.com/*"]);
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(["https://*/*"]));
    expect(manifest.content_scripts).toBeUndefined(); // no always-on content scripts: injection only after a user action
  });
  it("uses a strict extension-page CSP", () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
  });
  it("references an existing popup, side panel and icons in source", () => {
    expect(existsSync(resolve(root, manifest.action.default_popup))).toBe(true);
    expect(existsSync(resolve(root, manifest.side_panel.default_path))).toBe(true);
    for (const p of Object.values(manifest.icons) as string[]) expect(existsSync(resolve(root, "public", p))).toBe(true);
  });
});
