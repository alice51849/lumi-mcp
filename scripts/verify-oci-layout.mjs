#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

async function blob(root, descriptor) {
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

function isIndex(descriptor) {
  return /(?:image\.index|manifest\.list)\.v(?:1|2)\+json$/u.test(
    descriptor.mediaType ?? "",
  );
}

function targetImages(index) {
  return (index.manifests ?? []).filter(
    (manifest) =>
      manifest.platform?.os === "linux" &&
      ["amd64", "arm64"].includes(manifest.platform?.architecture),
  );
}

export async function verifyOciLayout(root, outputPath) {
  const layout = JSON.parse(
    await readFile(path.join(root, "oci-layout"), "utf8"),
  );
  assert.equal(layout.imageLayoutVersion, "1.0.0");
  const rootIndex = JSON.parse(
    await readFile(path.join(root, "index.json"), "utf8"),
  );
  const indexes = [rootIndex];
  const visited = new Set();
  for (let position = 0; position < indexes.length; position += 1) {
    const current = indexes[position];
    assert.ok(Array.isArray(current.manifests));
    for (const descriptor of current.manifests) {
      assert.match(descriptor.digest, /^sha256:[a-f0-9]{64}$/u);
      assert.ok(Number.isInteger(descriptor.size) && descriptor.size > 0);
      if (!isIndex(descriptor) || visited.has(descriptor.digest)) continue;
      visited.add(descriptor.digest);
      indexes.push(await blob(root, descriptor));
    }
  }

  const imageIndex = indexes.find((candidate) => {
    const platforms = new Set(
      targetImages(candidate).map(
        (manifest) =>
          `${manifest.platform.os}/${manifest.platform.architecture}`,
      ),
    );
    return (
      platforms.has("linux/amd64") &&
      platforms.has("linux/arm64")
    );
  });
  assert.ok(imageIndex, "OCI layout has no amd64/arm64 image index.");
  const imageManifests = targetImages(imageIndex);
  assert.deepEqual(
    new Set(
      imageManifests.map(
        (manifest) =>
          `${manifest.platform.os}/${manifest.platform.architecture}`,
      ),
    ),
    new Set(["linux/amd64", "linux/arm64"]),
  );
  for (const descriptor of imageManifests) {
    await blob(root, descriptor);
  }

  const predicatesByImage = new Map(
    imageManifests.map((manifest) => [manifest.digest, new Set()]),
  );
  const attestations = imageIndex.manifests.filter(
    (manifest) =>
      manifest.annotations?.["vnd.docker.reference.type"] ===
      "attestation-manifest",
  );
  assert.equal(attestations.length, imageManifests.length);
  for (const descriptor of attestations) {
    const subject =
      descriptor.annotations?.["vnd.docker.reference.digest"];
    assert.equal(predicatesByImage.has(subject), true);
    const manifest = await blob(root, descriptor);
    assert.equal(
      manifest.subject?.digest,
      subject,
      "OCI attestation manifest is not bound to its image manifest.",
    );
    for (const layer of manifest.layers ?? []) {
      if (layer.mediaType !== "application/vnd.in-toto+json") continue;
      const statement = await blob(root, layer);
      assert.equal(
        statement._type,
        "https://in-toto.io/Statement/v1",
      );
      const annotatedPredicate =
        layer.annotations?.["in-toto.io/predicate-type"];
      if (annotatedPredicate) {
        assert.equal(annotatedPredicate, statement.predicateType);
      }
      const predicate = annotatedPredicate ?? statement.predicateType;
      if (predicate) predicatesByImage.get(subject).add(predicate);
    }
  }
  for (const predicates of predicatesByImage.values()) {
    assert.equal(
      [...predicates].some((value) =>
        value.includes("spdx.dev/Document"),
      ),
      true,
      `Image attestation is missing a subject-bound SPDX predicate: ${
        [...predicates].join(", ") || "none"
      }`,
    );
    assert.equal(
      [...predicates].some((value) =>
        value.includes("slsa.dev/provenance"),
      ),
      true,
      `Image attestation is missing subject-bound provenance: ${
        [...predicates].join(", ") || "none"
      }`,
    );
  }
  if (outputPath) {
    await writeFile(
      outputPath,
      `${JSON.stringify(imageIndex, null, 2)}\n`,
      "utf8",
    );
  }
  return imageIndex;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [root, outputPath] = process.argv.slice(2);
  if (!root) {
    throw new Error(
      "Usage: verify-oci-layout.mjs <oci-layout> [resolved-index.json]",
    );
  }
  await verifyOciLayout(root, outputPath);
  console.log(
    "OCI layout contains amd64/arm64 images with SBOM and provenance attestations.",
  );
}
