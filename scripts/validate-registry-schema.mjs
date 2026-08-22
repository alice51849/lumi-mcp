#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);
const files = process.argv.slice(2);
if (!files.length) files.push("server.json", "server.release.json");
const manifests = await Promise.all(
  files.map(async (file) => ({
    file,
    server: JSON.parse(
      await readFile(new URL(file, root), "utf8"),
    ),
  })),
);
const schemaUrl = manifests[0].server.$schema;
if (manifests.some(({ server }) => server.$schema !== schemaUrl)) {
  throw new Error("Registry manifests must use one pinned schema.");
}
const response = await fetch(schemaUrl, {
  headers: { accept: "application/schema+json, application/json" },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`Registry schema returned HTTP ${response.status}.`);
}
const rawSchema = await response.text();
if (Buffer.byteLength(rawSchema, "utf8") > 1_000_000) {
  throw new Error("Registry schema exceeds the 1 MB safety limit.");
}
const schema = JSON.parse(rawSchema);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const packageJson = JSON.parse(
  await readFile(new URL("package.json", root), "utf8"),
);
const bundleManifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);

for (const { file, server } of manifests) {
  if (!validate(server)) {
    throw new Error(
      `${file} does not match the official MCP Registry schema: ` +
        `${ajv.errorsText(validate.errors, { separator: "; " })}`,
    );
  }
  assert.match(server.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  const packageTypes = server.packages
    .map((entry) => entry.registryType)
    .sort();
  const mcpb = server.packages.find(
    (entry) => entry.registryType === "mcpb",
  );
  assert.ok(mcpb, `${file} must include an MCPB package.`);
  assert.equal(mcpb.version, server.version);
  assert.equal(
    mcpb.identifier,
    `https://github.com/alice51849/lumi-mcp/releases/download/` +
      `v${server.version}/lumi-app-finder.mcpb`,
  );
  assert.match(mcpb.fileSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(Object.keys(server._meta), [
    "io.modelcontextprotocol.registry/publisher-provided",
  ]);
  assert.ok(
    Buffer.byteLength(
      JSON.stringify(
        server._meta[
          "io.modelcontextprotocol.registry/publisher-provided"
        ],
      ),
      "utf8",
    ) <= 4096,
  );

  if (path.basename(file) === "server.release.json") {
    assert.deepEqual(packageTypes, ["mcpb", "oci"]);
    assert.equal(server.version, packageJson.version);
    assert.equal(server.version, bundleManifest.version);
    const oci = server.packages.find(
      (entry) => entry.registryType === "oci",
    );
    assert.equal(
      oci.identifier,
      `ghcr.io/alice51849/lumi-app-finder:${server.version}`,
    );
    assert.equal(Object.hasOwn(oci, "registryBaseUrl"), false);
    assert.deepEqual(oci.transport, { type: "stdio" });
  } else {
    const published = await fetch(mcpb.identifier, {
      headers: { accept: "application/octet-stream" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!published.ok) {
      throw new Error(
        `${file} declares unavailable MCPB HTTP ${published.status}.`,
      );
    }
    const bytes = Buffer.from(await published.arrayBuffer());
    assert.ok(bytes.length < 10_000_000, "Published MCPB exceeds 10 MB.");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      mcpb.fileSha256,
      `${file} MCPB digest does not match its public release.`,
    );
  }
  console.log(`${file} matches the official MCP Registry schema.`);
}
