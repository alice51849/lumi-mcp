#!/usr/bin/env python3
"""Build a byte-reproducible MCPB archive from the approved runtime files."""

from __future__ import annotations

from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "lumi-app-finder.mcpb"
FIXED_TIMESTAMP = (2026, 1, 1, 0, 0, 0)
BASE_FILES = (
    "LICENSE",
    "manifest.json",
    "MCP_APP_NOTICES.txt",
    "PRIVACY.md",
    "README.md",
    "server/catalog.json",
    "server/index.mjs",
    "THIRD_PARTY_NOTICES.txt",
    "ui/app-finder.html",
)


def approved_files() -> tuple[Path, ...]:
    resources = tuple(
        sorted((ROOT / "mcpb-resources").glob("*.json"))
    )
    if len(resources) != 50:
        raise ValueError(
            f"Expected 50 MCPB localization resources, found {len(resources)}"
        )
    files = tuple(ROOT / relative for relative in BASE_FILES) + resources
    missing = tuple(path for path in files if not path.is_file())
    if missing:
        raise FileNotFoundError(
            "Missing MCPB files: "
            + ", ".join(str(path.relative_to(ROOT)) for path in missing)
        )
    return tuple(sorted(files, key=lambda path: path.relative_to(ROOT).as_posix()))


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.unlink(missing_ok=True)
    with zipfile.ZipFile(
        temporary,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in approved_files():
            relative = path.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(relative, date_time=FIXED_TIMESTAMP)
            info.create_system = 3
            mode = 0o755 if relative == "server/index.mjs" else 0o644
            info.external_attr = mode << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes(), compresslevel=9)
    temporary.replace(OUTPUT)
    print(
        f"Packed {OUTPUT.relative_to(ROOT)} "
        f"({OUTPUT.stat().st_size} bytes, {len(approved_files())} files)"
    )


if __name__ == "__main__":
    build()
