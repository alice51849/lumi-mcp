#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_SOURCE_URL,
  EXPECTED_APP_COUNT,
  OFFICIAL_LOCALES,
  validateGuideUrl,
  validateMcpStoreUrl,
  validateSnapshotCatalog,
} from "../server/catalog-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "server", "catalog.json");
const REFERENCES_PATH = path.join(
  ROOT,
  "skills",
  "lumi-app-finder",
  "references",
);
const CHECK = process.argv.includes("--check");
const REQUIRED_FIELDS = Object.freeze([
  "record_id",
  "locale",
  "app_key",
  "app_name",
  "app_store_id",
  "publisher_query",
  "decision_context",
  "purchase_model",
  "purchase_label",
  "source_persona_query",
  "canonical_guide_url",
  "canonical_app_store_url",
  "app_store_url",
  "app_store_cta_label",
]);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function singleLine(value, field) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\r\n\u2028\u2029]/u.test(value)
  ) {
    throw new Error(`Invalid single-line skill field '${field}'.`);
  }
  return value.trim();
}

function skillRecord(record) {
  for (const field of REQUIRED_FIELDS) {
    singleLine(record?.[field], field);
  }
  if (!/^\d{9,12}$/u.test(record.app_store_id)) {
    throw new Error(`Invalid App Store ID for '${record.app_key}'.`);
  }
  validateMcpStoreUrl(
    record.app_store_url,
    record.app_store_id,
    record.locale,
  );
  validateGuideUrl(
    record.canonical_guide_url,
    record.locale,
    record.app_key,
  );
  return {
    app_key: record.app_key,
    app_name: record.app_name,
    app_store_id: record.app_store_id,
    publisher_query: record.publisher_query,
    source_persona_query: record.source_persona_query,
    decision_context: record.decision_context,
    purchase_model: record.purchase_model,
    purchase_label: record.purchase_label,
    one_time_option: record.one_time_option,
    verified_live: true,
    guide_url: record.canonical_guide_url,
    canonical_app_store_url: record.canonical_app_store_url,
    app_store_url: record.app_store_url,
    app_store_cta_label: record.app_store_cta_label,
  };
}

async function expectedReferences() {
  const catalog = validateSnapshotCatalog(
    JSON.parse(await readFile(CATALOG_PATH, "utf8")),
  );

  const expected = new Map();
  for (const locale of OFFICIAL_LOCALES) {
    const ui = catalog.ui?.[locale];
    const apps = catalog.records
      .filter((record) => record.locale === locale)
      .sort((left, right) => left.app_key.localeCompare(right.app_key))
      .map(skillRecord);
    if (
      apps.length !== EXPECTED_APP_COUNT ||
      new Set(apps.map((app) => app.app_key)).size !== EXPECTED_APP_COUNT
    ) {
      throw new Error(
        `Skill locale '${locale}' does not cover ` +
          `${EXPECTED_APP_COUNT} apps.`,
      );
    }
    const payload = {
      schema_version: "1.1",
      date_modified: catalog.date_modified,
      catalog_source: CATALOG_SOURCE_URL,
      source_content_digest: catalog.source_content_digest,
      snapshot_content_digest: catalog.content_digest,
      locale,
      app_count: apps.length,
      publisher: "Lumi Studio",
      publisher_disclosure: singleLine(
        ui?.disclosure,
        `${locale}.publisher_disclosure`,
      ),
      non_ranking_disclosure: singleLine(
        ui?.non_measured,
        `${locale}.non_ranking_disclosure`,
      ),
      query_origin: catalog.query_origin,
      measured_search_volume: false,
      is_ranking: false,
      apps,
    };
    expected.set(`${locale}.json`, stableJson(payload));
  }
  return expected;
}

async function main() {
  const expected = await expectedReferences();
  await mkdir(REFERENCES_PATH, { recursive: true });
  const existing = (await readdir(REFERENCES_PATH))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const expectedNames = [...expected.keys()].sort();
  if (
    CHECK &&
    JSON.stringify(existing) !== JSON.stringify(expectedNames)
  ) {
    throw new Error("Generated Agent Skill locale files are incomplete or stale.");
  }

  for (const [file, content] of expected) {
    const target = path.join(REFERENCES_PATH, file);
    if (CHECK) {
      if ((await readFile(target, "utf8")) !== content) {
        throw new Error(`Generated Agent Skill reference is stale: ${file}`);
      }
    } else {
      await writeFile(target, content);
    }
  }
  console.log(
    `${CHECK ? "Verified" : "Generated"} ${expected.size} Agent Skill locale catalogs.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
