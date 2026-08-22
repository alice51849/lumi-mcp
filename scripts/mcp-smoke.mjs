#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EXPECTED_RECORD_COUNT,
  MCP_CAMPAIGN_TOKEN,
  OFFICIAL_LOCALES,
  validateMcpStoreUrl,
  validateSnapshotCatalog,
} from "../server/catalog-contract.mjs";
import {
  commandFromArguments,
  RpcClient,
} from "./lib/rpc-client.mjs";

const root = new URL("../", import.meta.url);
const [catalog, packageJson] = await Promise.all([
  readFile(new URL("server/catalog.json", root), "utf8")
    .then(JSON.parse)
    .then(validateSnapshotCatalog),
  readFile(new URL("package.json", root), "utf8").then(JSON.parse),
]);
const command = commandFromArguments([
  process.execPath,
  new URL("../server/index.mjs", import.meta.url).pathname,
]);
const client = new RpcClient(command.executable, command.args);

try {
  const initialized = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "oci-smoke", version: "1.0.0" },
  });
  assert.equal(initialized.result?.protocolVersion, "2025-06-18");
  assert.equal(initialized.result?.serverInfo?.name, "lumi-app-finder");
  assert.equal(
    initialized.result?.serverInfo?.version,
    packageJson.version,
  );
  client.notify("notifications/initialized");

  const tools = await client.request("tools/list");
  assert.equal(tools.result?.tools?.length, 1);
  assert.equal(tools.result.tools[0].name, "find_ios_apps");
  assert.equal(
    tools.result.tools[0].inputSchema?.properties?.locale?.enum?.length,
    OFFICIAL_LOCALES.length,
  );

  const appKey = [...new Set(
    catalog.records.map((record) => record.app_key),
  )].sort()[0];
  for (const locale of OFFICIAL_LOCALES) {
    const expected = catalog.records.find(
      (record) => record.app_key === appKey && record.locale === locale,
    );
    assert.ok(expected, `${appKey}/${locale}`);
    const response = await client.request("tools/call", {
      name: "find_ios_apps",
      arguments: {
        query: expected.app_store_id,
        locale,
        limit: 1,
      },
    });
    const output = response.result?.structuredContent;
    assert.equal(output?.locale, locale);
    assert.equal(output?.catalog_source, "bundled_verified_snapshot");
    assert.equal(output?.catalog_record_count, EXPECTED_RECORD_COUNT);
    assert.equal(output?.catalog_content_digest, catalog.source_content_digest);
    assert.equal(output?.results?.length, 1);
    const result = output.results[0];
    assert.equal(result.app_key, appKey);
    assert.equal(result.app_store_id, expected.app_store_id);
    assert.equal(result.app_store_url, expected.app_store_url);
    assert.equal(result.guide_url, expected.canonical_guide_url);
    assert.equal(result.one_time_option, true);
    const store = validateMcpStoreUrl(
      result.app_store_url,
      result.app_store_id,
      locale,
    );
    assert.equal(store.searchParams.get("ct"), MCP_CAMPAIGN_TOKEN);
  }
  assert.equal(client.stderr, "");
} finally {
  await client.close();
}

console.log(
  `MCP digest smoke passed initialize -> tools/list -> tools/call for ` +
    `${OFFICIAL_LOCALES.length} locales.`,
);
