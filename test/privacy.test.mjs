import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("runtime is offline and contains no telemetry or sensitive request logs", async () => {
  const [server, contract, ui, privacy, dockerfile] = await Promise.all([
    readFile(new URL("server/index.mjs", root), "utf8"),
    readFile(new URL("server/catalog-contract.mjs", root), "utf8"),
    readFile(new URL("ui/app-finder.mjs", root), "utf8"),
    readFile(new URL("PRIVACY.md", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
  ]);
  for (const source of [server, contract]) {
    assert.doesNotMatch(source, /\bfetch\s*\(/u);
    assert.doesNotMatch(source, /\b(?:telemetry|analytics)\b/iu);
    assert.doesNotMatch(source, /user-agent/iu);
    assert.doesNotMatch(source, /\bquery\b.*console\./iu);
  }
  assert.doesNotMatch(ui, /console\.(?:log|info|warn|error)/u);
  assert.doesNotMatch(dockerfile, /^\s*ENV\s+/mu);
  assert.match(privacy, /zero\s+telemetry/iu);
  assert.match(privacy, /does not log.*query/iu);
  assert.match(privacy, /IP address/iu);
  assert.match(privacy, /user-agent/iu);
  assert.match(privacy, /no runtime network/iu);
});
