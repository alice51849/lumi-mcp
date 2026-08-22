#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: verify-oci-layout.mjs <oci-layout>");

async function blob(descriptor) {
  assert.match(descriptor.digest, /^sha256:[a-f0-9]{64}$/u);
  const file = path.join(
    root,
    "blobs",
    "sha256",
    descriptor.digest.slice("sha256:".length),
  );
  const content = await readFile(file);
  assert.equal(content.length, descriptor.size);
  return JSON.parse(content.toString("utf8"));
}

const index = JSON.parse(
  await readFile(path.join(root, "index.json"), "utf8"),
);
const imageManifests = index.manifests.filter(
  (manifest) =>
    manifest.platform?.os === "linux" &&
    ["amd64", "arm64"].includes(manifest.platform?.architecture),
);
assert.deepEqual(
  new Set(
    imageManifests.map(
      (manifest) =>
        `${manifest.platform.os}/${manifest.platform.architecture}`,
    ),
  ),
  new Set(["linux/amd64", "linux/arm64"]),
);

const predicatesByImage = new Map(
  imageManifests.map((manifest) => [manifest.digest, new Set()]),
);
const attestations = index.manifests.filter(
  (manifest) =>
    manifest.annotations?.["vnd.docker.reference.type"] ===
    "attestation-manifest",
);
assert.equal(attestations.length, imageManifests.length);
for (const descriptor of attestations) {
  const subject =
    descriptor.annotations?.["vnd.docker.reference.digest"];
  assert.equal(predicatesByImage.has(subject), true);
  const manifest = await blob(descriptor);
  for (const layer of manifest.layers ?? []) {
    if (layer.mediaType !== "application/vnd.in-toto+json") continue;
    const statement = await blob(layer);
    assert.equal(
      statement.subject?.some(
        (entry) => entry.digest?.sha256 === subject.slice("sha256:".length),
      ),
      true,
    );
    const predicate =
      layer.annotations?.["in-toto.io/predicate-type"] ??
      statement.predicateType;
    if (predicate) predicatesByImage.get(subject).add(predicate);
  }
}
for (const predicates of predicatesByImage.values()) {
  assert.equal(
    [...predicates].some((value) => value.includes("spdx.dev/Document")),
    true,
  );
  assert.equal(
    [...predicates].some((value) => value.includes("slsa.dev/provenance")),
    true,
  );
}
console.log(
  "OCI layout contains amd64/arm64 images with SBOM and provenance attestations.",
);
