#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("Usage: verify-image-index.mjs <index.json>");
const index = JSON.parse(await readFile(file, "utf8"));
assert.match(
  index.mediaType,
  /(?:image\.index|manifest\.list)\.v(?:1|2)\+json$/u,
);
assert.ok(Array.isArray(index.manifests));
const platforms = new Set(
  index.manifests
    .filter((manifest) => manifest.platform?.os === "linux")
    .map(
      (manifest) =>
        `${manifest.platform.os}/${manifest.platform.architecture}`,
    ),
);
assert.equal(platforms.has("linux/amd64"), true);
assert.equal(platforms.has("linux/arm64"), true);
for (const manifest of index.manifests) {
  assert.match(manifest.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(Number.isInteger(manifest.size) && manifest.size > 0);
}
console.log("OCI index contains linux/amd64 and linux/arm64 manifests.");
