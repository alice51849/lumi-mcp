#!/usr/bin/env bash
set -euo pipefail

readonly version="1.51.0"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    platform="linux_amd64"
    expected_sha256="2a2e837a2c8d59ec9af5472ee22d3b04ee463c4e44476ecf993fd1e5ab6ebc7f"
    ;;
  Darwin-arm64)
    platform="darwin_arm64"
    expected_sha256="4f37f4c7fefce0a68e4cf71ba3f5f9829a99e65d89b29f7ee41b8c2c10ea8c59"
    ;;
  *)
    echo "Unsupported Syft installer platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac
readonly platform
readonly expected_sha256
readonly archive="syft_${version}_${platform}.tar.gz"
readonly url="https://github.com/anchore/syft/releases/download/v${version}/${archive}"
readonly bin_dir="${RUNNER_TEMP}/lumi-syft-bin"

readonly work_dir="$(mktemp -d "${RUNNER_TEMP}/lumi-syft.XXXXXX")"
curl \
  --fail \
  --location \
  --silent \
  --show-error \
  --retry 3 \
  --retry-all-errors \
  --connect-timeout 15 \
  --max-time 120 \
  --proto '=https' \
  --tlsv1.2 \
  "$url" \
  --output "${work_dir}/${archive}"
node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const [archivePath, expected] = process.argv.slice(1);
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(archivePath))
    .digest("hex");
  if (actual !== expected) {
    throw new Error(`Syft archive checksum mismatch: ${actual}`);
  }
' "${work_dir}/${archive}" "$expected_sha256"
tar -xzf "${work_dir}/${archive}" -C "$work_dir" syft
mkdir -p "$bin_dir"
install -m 0755 "${work_dir}/syft" "${bin_dir}/syft"
"${bin_dir}/syft" version
printf '%s\n' "$bin_dir" >> "$GITHUB_PATH"
