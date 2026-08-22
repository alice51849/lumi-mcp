import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyRegistryVersion,
} from "../scripts/verify-registry-version.mjs";

const expected = {
  name: "io.github.alice51849/lumi-app-finder",
  version: "1.2.0",
  packages: [
    {
      registryType: "mcpb",
      identifier: "https://example.test/lumi-app-finder.mcpb",
      version: "1.2.0",
      fileSha256: "a".repeat(64),
      transport: { type: "stdio" },
    },
    {
      registryType: "oci",
      identifier: "ghcr.io/alice51849/lumi-app-finder:1.2.0",
      transport: { type: "stdio" },
    },
  ],
};

function response(server = expected) {
  return { servers: [{ server }] };
}

test("exact immutable Registry version reconciles as published", () => {
  const normalized = structuredClone(expected);
  delete normalized.packages[0].version;
  assert.equal(verifyRegistryVersion(response(normalized), expected), true);
});

test("missing Registry version remains publishable", () => {
  assert.equal(verifyRegistryVersion({ servers: [] }, expected), false);
});

test("mismatched immutable Registry package fails closed", () => {
  const altered = structuredClone(expected);
  altered.packages[0].fileSha256 = "b".repeat(64);
  assert.throws(
    () => verifyRegistryVersion(response(altered), expected),
    /Expected values to be strictly equal/u,
  );
});
