#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_LOCALES,
  validateSnapshotCatalog,
} from "../server/catalog-contract.mjs";
import { RpcClient } from "./lib/rpc-client.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = validateSnapshotCatalog(
  JSON.parse(await readFile(path.join(root, "server/catalog.json"), "utf8")),
);
const appKey = [...new Set(
  catalog.records.map((record) => record.app_key),
)].sort()[0];
const client = new RpcClient(process.execPath, [
  path.join(root, "server/index.mjs"),
]);

function milliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

const started = process.hrtime.bigint();
const initialized = await client.request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "benchmark", version: "1.0.0" },
});
assert.equal(initialized.result?.serverInfo?.name, "lumi-app-finder");
const initializeMs = milliseconds(started);
client.notify("notifications/initialized");

const callDurations = [];
const callsStarted = process.hrtime.bigint();
for (const locale of OFFICIAL_LOCALES) {
  const record = catalog.records.find(
    (entry) => entry.locale === locale && entry.app_key === appKey,
  );
  const callStarted = process.hrtime.bigint();
  const response = await client.request("tools/call", {
    name: "find_ios_apps",
    arguments: { query: record.app_store_id, locale, limit: 1 },
  });
  callDurations.push(milliseconds(callStarted));
  assert.equal(
    response.result?.structuredContent?.results?.[0]?.app_key,
    appKey,
  );
}
const callsMs = milliseconds(callsStarted);
await client.close();
assert.equal(client.stderr, "");

const sortedDurations = [...callDurations].sort((left, right) => left - right);
const percentile95 =
  sortedDurations[Math.ceil(sortedDurations.length * 0.95) - 1];
const sizes = Object.fromEntries(
  await Promise.all([
    ["catalog_bytes", "server/catalog.json", 5_000_000],
    ["ui_bytes", "ui/app-finder.html", 1_000_000],
  ].map(async ([name, relative, limit]) => {
    const bytes = (await stat(path.join(root, relative))).size;
    assert.ok(bytes <= limit, `${relative} exceeds ${limit} bytes`);
    return [name, bytes];
  })),
);
for (const [name, relative, limit] of [
  ["mcpb_bytes", "dist/lumi-app-finder.mcpb", 5_000_000],
]) {
  let bytes;
  try {
    bytes = (await stat(path.join(root, relative))).size;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    continue;
  }
  assert.ok(bytes <= limit, `${relative} exceeds ${limit} bytes`);
  sizes[name] = bytes;
}
assert.ok(initializeMs < 5_000, "MCP initialize exceeded 5 seconds");
assert.ok(callsMs < 15_000, "50-locale calls exceeded 15 seconds");
assert.ok(percentile95 < 1_000, "MCP tools/call p95 exceeded 1 second");

const report = {
  app_count: catalog.app_count,
  locale_count: catalog.locale_count,
  record_count: catalog.record_count,
  initialize_ms: Number(initializeMs.toFixed(2)),
  calls_50_ms: Number(callsMs.toFixed(2)),
  call_p95_ms: Number(percentile95.toFixed(2)),
  ...sizes,
};
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a file path.");
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(
    path.resolve(output),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}
console.log(JSON.stringify(report));
