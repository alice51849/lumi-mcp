#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

function packageByType(packages, registryType) {
  return packages.find(
    (entry) => entry.registryType === registryType,
  );
}

export function verifyRegistryVersion(payload, expected) {
  const matches = (payload.servers ?? [])
    .map((entry) => entry.server)
    .filter(
      (server) =>
        server?.name === expected.name &&
        server?.version === expected.version,
    );
  if (!matches.length) return false;
  assert.equal(
    matches.length,
    1,
    "Registry returned duplicate rows for one immutable version.",
  );
  const actual = matches[0];
  assert.deepEqual(
    actual.packages.map((entry) => entry.registryType).sort(),
    expected.packages.map((entry) => entry.registryType).sort(),
  );
  for (const wanted of expected.packages) {
    const published = packageByType(
      actual.packages,
      wanted.registryType,
    );
    assert.ok(
      published,
      `Registry omitted ${wanted.registryType} package.`,
    );
    assert.equal(published.identifier, wanted.identifier);
    assert.deepEqual(published.transport, wanted.transport);
    for (const field of ["fileSha256"]) {
      if (Object.hasOwn(wanted, field)) {
        assert.equal(published[field], wanted[field]);
      }
    }
  }
  return true;
}

async function main() {
  const [responsePath, expectedPath = "server.release.json"] =
    process.argv.slice(2);
  if (!responsePath) {
    throw new Error(
      "Usage: verify-registry-version.mjs <response.json> [server.release.json]",
    );
  }
  const [payload, expected] = await Promise.all([
    readFile(path.resolve(responsePath), "utf8").then(JSON.parse),
    readFile(path.resolve(expectedPath), "utf8").then(JSON.parse),
  ]);
  if (!verifyRegistryVersion(payload, expected)) {
    console.error(
      `Registry version ${expected.name}@${expected.version} is absent.`,
    );
    process.exitCode = 3;
    return;
  }
  console.log(
    `Registry version ${expected.name}@${expected.version} matches.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
