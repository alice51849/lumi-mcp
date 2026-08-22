#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  throw new Error("Usage: verify-image-metadata.mjs <docker-inspect.json>");
}
const [image] = JSON.parse(await readFile(file, "utf8"));
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
assert.ok(image);
assert.equal(image.Os, "linux");
assert.ok(["amd64", "arm64"].includes(image.Architecture));
assert.match(image.Id, /^sha256:[a-f0-9]{64}$/u);
assert.ok(image.Size > 0 && image.Size <= 180_000_000);
assert.equal(image.Config?.User, "65532:65532");
assert.deepEqual(image.Config?.Entrypoint, ["/nodejs/bin/node"]);
assert.deepEqual(image.Config?.Cmd, ["server/index.mjs"]);

const labels = image.Config?.Labels ?? {};
assert.equal(labels["org.opencontainers.image.title"], "Lumi App Finder");
assert.equal(
  labels["org.opencontainers.image.source"],
  "https://github.com/alice51849/lumi-mcp",
);
assert.equal(labels["org.opencontainers.image.licenses"], "MIT");
assert.equal(
  labels["org.opencontainers.image.version"],
  packageJson.version,
);
assert.equal(
  labels["io.modelcontextprotocol.server.name"],
  "io.github.alice51849/lumi-app-finder",
);
assert.match(
  labels["org.opencontainers.image.revision"],
  /^(?:unknown|[a-f0-9]{40})$/u,
);
console.log(
  `OCI metadata passed (${image.Architecture}, ${image.Size} bytes).`,
);
