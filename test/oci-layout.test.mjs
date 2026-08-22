import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  verifyOciLayout,
} from "../scripts/verify-oci-layout.mjs";

async function writeBlob(root, value, extra = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  const hash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(root, "blobs", "sha256", hash), bytes);
  return {
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    digest: `sha256:${hash}`,
    size: bytes.length,
    ...extra,
  };
}

async function attestation(root, subject, predicateTypes) {
  const unrelated = await writeBlob(
    root,
    {
      _type: "https://in-toto.io/Statement/v1",
      subject: [],
      predicateType: "https://example.test/auxiliary",
      predicate: {},
    },
    {
      mediaType: "application/vnd.in-toto+json",
      annotations: {
        "in-toto.io/predicate-type": "https://example.test/auxiliary",
      },
    },
  );
  const layers = [unrelated];
  for (const predicateType of predicateTypes) {
    layers.push(
      await writeBlob(
        root,
        {
          _type: "https://in-toto.io/Statement/v1",
          subject: [
            {
              digest: {
                sha256: subject.digest.slice("sha256:".length),
              },
            },
          ],
          predicateType,
          predicate: {},
        },
        {
          mediaType: "application/vnd.in-toto+json",
          annotations: {
            "in-toto.io/predicate-type": predicateType,
          },
        },
      ),
    );
  }
  return writeBlob(
    root,
    {
      schemaVersion: 2,
      artifactType: "application/vnd.docker.attestation.manifest.v1+json",
      subject: {
        mediaType: subject.mediaType,
        digest: subject.digest,
        size: subject.size,
      },
      layers,
    },
    {
      annotations: {
        "vnd.docker.reference.type": "attestation-manifest",
        "vnd.docker.reference.digest": subject.digest,
      },
      platform: { os: "unknown", architecture: "unknown" },
    },
  );
}

test("nested OCI layout resolves both images and their attestations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lumi-oci-layout-"));
  try {
    await mkdir(path.join(root, "blobs", "sha256"), { recursive: true });
    await writeFile(
      path.join(root, "oci-layout"),
      JSON.stringify({ imageLayoutVersion: "1.0.0" }),
    );
    const amd64 = await writeBlob(
      root,
      { schemaVersion: 2, layers: [] },
      { platform: { os: "linux", architecture: "amd64" } },
    );
    const arm64 = await writeBlob(
      root,
      { schemaVersion: 2, layers: [] },
      { platform: { os: "linux", architecture: "arm64" } },
    );
    const predicateTypes = [
      "https://spdx.dev/Document/v2.3",
      "https://slsa.dev/provenance/v1",
    ];
    const inner = {
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifests: [
        amd64,
        arm64,
        await attestation(root, amd64, predicateTypes),
        await attestation(root, arm64, predicateTypes),
      ],
    };
    const innerDescriptor = await writeBlob(root, inner, {
      mediaType: "application/vnd.oci.image.index.v1+json",
    });
    await writeFile(
      path.join(root, "index.json"),
      JSON.stringify({
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.index.v1+json",
        manifests: [innerDescriptor],
      }),
    );
    const output = path.join(root, "resolved-index.json");
    const resolved = await verifyOciLayout(root, output);
    assert.deepEqual(resolved, inner);
    assert.deepEqual(
      JSON.parse(await readFile(output, "utf8")),
      inner,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
