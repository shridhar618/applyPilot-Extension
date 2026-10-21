"""Zips apps/extension/dist into dist-zip/applypilot-ai-<version>.zip (the unpacked dist/ stays available for Load unpacked)."""
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dist = root / "apps/extension/dist"
version = json.loads((dist / "manifest.json").read_text())["version"]
out = root / "apps/extension" / f"applypilot-ai-{version}.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(dist.rglob("*")):
        if f.is_file():
            z.write(f, f.relative_to(dist))
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
