#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "server", "catalog.json");
const REFERENCES_PATH = path.join(
  ROOT,
  "skills",
  "lumi-app-finder",
  "references",
);
const CATALOG_SOURCE =
  "https://alice51849.github.io/ios-app-guide/data/" +
  "lumi-studio-publisher-search-intent-catalog.json";
const CHECK = process.argv.includes("--check");
const EXPECTED_APP_COUNT = 29;
const EXPECTED_LOCALE_COUNT = 50;
const EXPECTED_RECORD_COUNT = EXPECTED_APP_COUNT * EXPECTED_LOCALE_COUNT;
const REQUIRED_FIELDS = Object.freeze([
  "app_key",
  "app_name",
  "app_store_id",
  "publisher_query",
  "decision_context",
  "purchase_model",
  "purchase_label",
  "source_persona_query",
  "canonical_guide_url",
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

function validateStoreUrl(value, appId) {
  const url = new URL(value);
  const params = [...url.searchParams.entries()];
  const keys = new Set(params.map(([key]) => key));
  const isClean = params.length === 0;
  const isFullyAttributed =
    params.length === 3 &&
    keys.size === 3 &&
    keys.has("pt") &&
    keys.has("ct") &&
    keys.has("mt") &&
    /^\d{1,20}$/u.test(url.searchParams.get("pt") ?? "") &&
    /^[A-Za-z0-9/_]{1,30}$/u.test(url.searchParams.get("ct") ?? "") &&
    url.searchParams.get("mt") === "8";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apps.apple.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !new RegExp(`^/(?:[a-z]{2}/)?app/id${appId}$`, "u").test(
      url.pathname,
    ) ||
    (!isClean && !isFullyAttributed)
  ) {
    throw new Error(`Invalid App Store route for ${appId}.`);
  }
}

function validateGuideUrl(value, locale, appKey) {
  const url = new URL(value);
  const answerPrefix = `/ios-app-guide/${locale}/answers/`;
  const answerSlug = url.pathname.slice(answerPrefix.length);
  const isAnswer =
    url.pathname.startsWith(answerPrefix) &&
    /^[a-z0-9-]+\.html$/u.test(answerSlug);
  const isOwnedProduct =
    url.pathname === `/ios-app-guide/${locale}/${appKey}.html`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "alice51849.github.io" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!isAnswer && !isOwnedProduct)
  ) {
    throw new Error(`Invalid guide route for ${appKey}/${locale}.`);
  }
}

function skillRecord(record) {
  for (const field of REQUIRED_FIELDS) {
    singleLine(record?.[field], field);
  }
  if (!/^\d{9,12}$/u.test(record.app_store_id)) {
    throw new Error(`Invalid App Store ID for '${record.app_key}'.`);
  }
  validateStoreUrl(record.app_store_url, record.app_store_id);
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
    verified_live: true,
    guide_url: record.canonical_guide_url,
    app_store_url: record.app_store_url,
    app_store_cta_label: record.app_store_cta_label,
  };
}

async function expectedReferences() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  if (
    catalog?.app_count !== EXPECTED_APP_COUNT ||
    catalog?.locale_count !== EXPECTED_LOCALE_COUNT ||
    catalog?.record_count !== EXPECTED_RECORD_COUNT ||
    !Array.isArray(catalog.locales) ||
    catalog.locales.length !== EXPECTED_LOCALE_COUNT ||
    !Array.isArray(catalog.records) ||
    catalog.records.length !== EXPECTED_RECORD_COUNT
  ) {
    throw new Error(
      `Skill source catalog coverage is not ${EXPECTED_APP_COUNT} x ` +
        `${EXPECTED_LOCALE_COUNT}.`,
    );
  }

  const expected = new Map();
  for (const locale of catalog.locales) {
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
      schema_version: "1.0",
      date_modified: catalog.date_modified,
      catalog_source: CATALOG_SOURCE,
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
      query_origin: "publisher_authored_editorially_localized",
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
