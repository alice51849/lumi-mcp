import { createHash } from "node:crypto";

export const CATALOG_SOURCE_URL =
  "https://alice51849.github.io/ios-app-guide/data/" +
  "lumi-studio-publisher-search-intent-catalog.json";
export const CATALOG_SCHEMA_URL =
  "https://alice51849.github.io/ios-app-guide/data/" +
  "lumi-studio-publisher-search-intent-catalog.schema.json";
export const CATALOG_LICENSE_URL =
  "https://creativecommons.org/licenses/by/4.0/";
export const CATALOG_NAME =
  "Lumi Studio Publisher Search Intent Catalog";
export const QUERY_ORIGIN =
  "publisher_authored_editorially_localized";
export const CATALOG_ORDERING =
  "official_locale_order_then_alphabetical_app_name";
export const MCP_CAMPAIGN_TOKEN = "lumi_oci";
export const EXPECTED_APP_COUNT = 46;
export const OFFICIAL_LOCALES = Object.freeze([
  "ar-SA", "bn-BD", "ca", "cs", "da", "de-DE", "el", "en-AU",
  "en-CA", "en-GB", "en-US", "es-ES", "es-MX", "fi", "fr-CA",
  "fr-FR", "gu-IN", "he", "hi", "hr", "hu", "id", "it", "ja",
  "kn-IN", "ko", "ml-IN", "mr-IN", "ms", "nl-NL", "no", "or-IN",
  "pa-IN", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl-SI",
  "sv", "ta-IN", "te-IN", "th", "tr", "uk", "ur-PK", "vi",
  "zh-Hans", "zh-Hant",
]);
export const EXPECTED_RECORD_COUNT =
  EXPECTED_APP_COUNT * OFFICIAL_LOCALES.length;

const OFFICIAL_LOCALE_SET = new Set(OFFICIAL_LOCALES);
const PURCHASE_MODELS = new Set([
  "paid_upfront",
  "free_with_lifetime_unlock",
]);
const LOCALE_STOREFRONTS = Object.freeze({
  "ar-SA": "sa",
  "bn-BD": "in",
  ca: "es",
  cs: "cz",
  da: "dk",
  "de-DE": "de",
  el: "gr",
  "en-AU": "au",
  "en-CA": "ca",
  "en-GB": "gb",
  "en-US": "us",
  "es-ES": "es",
  "es-MX": "mx",
  fi: "fi",
  "fr-CA": "ca",
  "fr-FR": "fr",
  "gu-IN": "in",
  he: "il",
  hi: "in",
  hr: "hr",
  hu: "hu",
  id: "id",
  it: "it",
  ja: "jp",
  "kn-IN": "in",
  ko: "kr",
  "ml-IN": "in",
  "mr-IN": "in",
  ms: "my",
  "nl-NL": "nl",
  no: "no",
  "or-IN": "in",
  "pa-IN": "in",
  pl: "pl",
  "pt-BR": "br",
  "pt-PT": "pt",
  ro: "ro",
  ru: "ru",
  sk: "sk",
  "sl-SI": "si",
  sv: "se",
  "ta-IN": "in",
  "te-IN": "in",
  th: "th",
  tr: "tr",
  uk: "ua",
  "ur-PK": "pk",
  vi: "vn",
  "zh-Hans": "cn",
  "zh-Hant": "tw",
});
const COMMON_STRING_FIELDS = Object.freeze([
  "record_id",
  "locale",
  "app_key",
  "app_name",
  "app_store_id",
  "publisher_query",
  "decision_context",
  "purchase_model",
  "source_persona_query",
  "canonical_guide_url",
  "canonical_app_store_url",
  "app_store_url",
  "app_store_cta_label",
]);
const SOURCE_STRING_FIELDS = Object.freeze([
  ...COMMON_STRING_FIELDS,
  "publisher_disclosure",
  "query_origin",
]);
const SNAPSHOT_STRING_FIELDS = Object.freeze([
  ...COMMON_STRING_FIELDS,
  "purchase_label",
]);
const MAX_FIELD_LENGTHS = Object.freeze({
  record_id: 160,
  locale: 16,
  app_key: 64,
  app_name: 120,
  app_store_id: 12,
  publisher_query: 500,
  decision_context: 1200,
  purchase_model: 64,
  purchase_label: 300,
  source_persona_query: 500,
  canonical_guide_url: 2048,
  canonical_app_store_url: 2048,
  app_store_url: 2048,
  app_store_cta_label: 300,
  publisher_disclosure: 1000,
  query_origin: 80,
});
const UI_FIELDS = Object.freeze([
  "description",
  "disclosure",
  "non_measured",
  "locale_label",
  "records_label",
  "publisher_query_label",
  "decision_context_label",
  "purchase_model_label",
  "guide_label",
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function recordsDigest(records) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(records)), "utf8")
    .digest("hex");
}

function requiredText(record, field) {
  const value = record?.[field];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_FIELD_LENGTHS[field] ||
    CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error(`Catalog record has invalid '${field}'.`);
  }
  return value;
}

function exactCoverage(payload) {
  if (
    payload?.app_count !== EXPECTED_APP_COUNT ||
    payload?.locale_count !== OFFICIAL_LOCALES.length ||
    payload?.record_count !== EXPECTED_RECORD_COUNT ||
    JSON.stringify(payload?.locales) !== JSON.stringify(OFFICIAL_LOCALES) ||
    !Array.isArray(payload?.records) ||
    payload.records.length !== EXPECTED_RECORD_COUNT
  ) {
    throw new Error(
      `Catalog coverage must be exactly ${EXPECTED_APP_COUNT} apps x ` +
        `${OFFICIAL_LOCALES.length} locales (${EXPECTED_RECORD_COUNT} records).`,
    );
  }
}

function parsedStoreUrl(value, appId, locale, expectedCampaign) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid App Store URL for '${appId}/${locale}'.`);
  }
  const route = /^\/(?:([a-z]{2})\/)?app\/id(\d{9,12})$/u.exec(
    url.pathname,
  );
  const parameters = [...url.searchParams.entries()];
  const keys = new Set(parameters.map(([key]) => key));
  const campaign = url.searchParams.get("ct") ?? "";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apps.apple.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !route ||
    route[2] !== appId ||
    (route[1] && route[1] !== LOCALE_STOREFRONTS[locale]) ||
    parameters.length !== 3 ||
    keys.size !== 3 ||
    !keys.has("pt") ||
    !keys.has("ct") ||
    !keys.has("mt") ||
    !/^\d{1,20}$/u.test(url.searchParams.get("pt") ?? "") ||
    !/^[A-Za-z0-9/_]{1,30}$/u.test(campaign) ||
    url.searchParams.get("mt") !== "8" ||
    (expectedCampaign !== undefined && campaign !== expectedCampaign)
  ) {
    throw new Error(`Invalid App Store URL for '${appId}/${locale}'.`);
  }
  return url;
}

export function validateMcpStoreUrl(value, appId, locale) {
  return parsedStoreUrl(value, appId, locale, MCP_CAMPAIGN_TOKEN);
}

function validateSourceStoreUrl(value, appId, locale) {
  return parsedStoreUrl(value, appId, locale, undefined);
}

export function storefrontTerritory(value, appId, locale) {
  const url = validateMcpStoreUrl(value, appId, locale);
  return /^\/([a-z]{2})\/app\//u.exec(url.pathname)?.[1] ?? null;
}

export function coarseAttributionUrl(value, appId, locale) {
  const url = validateSourceStoreUrl(value, appId, locale);
  const providerToken = url.searchParams.get("pt");
  url.search = "";
  url.searchParams.set("pt", providerToken);
  url.searchParams.set("ct", MCP_CAMPAIGN_TOKEN);
  url.searchParams.set("mt", "8");
  validateMcpStoreUrl(url.toString(), appId, locale);
  return url.toString();
}

export function validateCanonicalStoreUrl(value, appId) {
  if (value !== `https://apps.apple.com/app/id${appId}`) {
    throw new Error(`Invalid canonical App Store URL for '${appId}'.`);
  }
  return value;
}

export function validateGuideUrl(value, locale, appKey) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid guide URL for '${appKey}/${locale}'.`);
  }
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
    throw new Error(`Invalid guide URL for '${appKey}/${locale}'.`);
  }
  return url;
}

function validateRecords(records, kind) {
  const requiredFields =
    kind === "source" ? SOURCE_STRING_FIELDS : SNAPSHOT_STRING_FIELDS;
  const pairs = new Set();
  const recordIds = new Set();
  const appContracts = new Map();
  const idOwners = new Map();
  const providerTokens = new Set();
  const appLocaleCounts = new Map();

  for (const record of records) {
    for (const field of requiredFields) requiredText(record, field);
    if (!OFFICIAL_LOCALE_SET.has(record.locale)) {
      throw new Error(`Unsupported catalog locale '${record.locale}'.`);
    }
    if (!/^[a-z0-9-]{1,64}$/u.test(record.app_key)) {
      throw new Error(`Invalid app key '${record.app_key}'.`);
    }
    if (!/^\d{9,12}$/u.test(record.app_store_id)) {
      throw new Error(`Invalid App Store ID '${record.app_store_id}'.`);
    }
    if (
      !PURCHASE_MODELS.has(record.purchase_model) ||
      record.one_time_option !== true
    ) {
      throw new Error(`Invalid purchase contract for '${record.app_key}'.`);
    }
    if (
      kind === "source" &&
      (
        record.query_origin !== QUERY_ORIGIN ||
        record.verified_live !== true ||
        record.measured_search_volume !== false ||
        record.is_ranking !== false
      )
    ) {
      throw new Error(
        `Invalid publisher contract for '${record.app_key}/${record.locale}'.`,
      );
    }

    const pair = `${record.app_key}\u0000${record.locale}`;
    if (pairs.has(pair)) throw new Error(`Duplicate catalog pair '${pair}'.`);
    pairs.add(pair);
    if (recordIds.has(record.record_id)) {
      throw new Error(`Duplicate catalog record ID '${record.record_id}'.`);
    }
    recordIds.add(record.record_id);

    const owner = idOwners.get(record.app_store_id);
    if (owner && owner !== record.app_key) {
      throw new Error(
        `App Store ID '${record.app_store_id}' belongs to multiple apps.`,
      );
    }
    idOwners.set(record.app_store_id, record.app_key);

    const contract = [
      record.app_store_id,
      record.purchase_model,
      record.canonical_app_store_url,
    ].join("\u0000");
    const existingContract = appContracts.get(record.app_key);
    if (existingContract && existingContract !== contract) {
      throw new Error(`App contract changed for '${record.app_key}'.`);
    }
    appContracts.set(record.app_key, contract);
    appLocaleCounts.set(
      record.app_key,
      (appLocaleCounts.get(record.app_key) ?? 0) + 1,
    );

    validateCanonicalStoreUrl(
      record.canonical_app_store_url,
      record.app_store_id,
    );
    validateGuideUrl(
      record.canonical_guide_url,
      record.locale,
      record.app_key,
    );
    const storeUrl =
      kind === "source"
        ? validateSourceStoreUrl(
          record.app_store_url,
          record.app_store_id,
          record.locale,
        )
        : validateMcpStoreUrl(
          record.app_store_url,
          record.app_store_id,
          record.locale,
        );
    providerTokens.add(storeUrl.searchParams.get("pt"));
  }

  if (
    pairs.size !== EXPECTED_RECORD_COUNT ||
    recordIds.size !== EXPECTED_RECORD_COUNT ||
    appContracts.size !== EXPECTED_APP_COUNT ||
    idOwners.size !== EXPECTED_APP_COUNT ||
    providerTokens.size !== 1 ||
    [...appLocaleCounts.values()].some(
      (count) => count !== OFFICIAL_LOCALES.length,
    )
  ) {
    throw new Error("Catalog does not fully cover unique apps and locales.");
  }
}

export function validateSourceCatalog(payload) {
  exactCoverage(payload);
  if (
    payload.$schema !== CATALOG_SCHEMA_URL ||
    payload.name !== CATALOG_NAME ||
    payload.identifier !== CATALOG_SOURCE_URL ||
    payload.license !== CATALOG_LICENSE_URL ||
    payload.query_origin !== QUERY_ORIGIN ||
    payload.measured_search_volume !== false ||
    payload.is_ranking !== false ||
    payload.ordering !== CATALOG_ORDERING ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(payload.dateModified ?? "") ||
    !SHA256.test(payload.content_digest ?? "") ||
    !SHA256.test(payload.generation_digest ?? "") ||
    payload.creator?.["@type"] !== "Organization" ||
    payload.creator?.name !== "Lumi Studio" ||
    payload.creator?.url !== "https://alice51849.github.io/ios-app-guide"
  ) {
    throw new Error("Publisher catalog metadata is invalid.");
  }
  if (recordsDigest(payload.records) !== payload.content_digest) {
    throw new Error("Publisher catalog content digest does not match records.");
  }
  validateRecords(payload.records, "source");
  return payload;
}

export function snapshotRecord(record, purchaseLabel) {
  if (typeof purchaseLabel !== "string" || !purchaseLabel.trim()) {
    throw new Error(
      `Missing purchase label for '${record.app_key}/${record.locale}'.`,
    );
  }
  return {
    record_id: record.record_id,
    locale: record.locale,
    app_key: record.app_key,
    app_name: record.app_name,
    app_store_id: record.app_store_id,
    publisher_query: record.publisher_query,
    decision_context: record.decision_context,
    purchase_model: record.purchase_model,
    purchase_label: purchaseLabel.trim(),
    one_time_option: record.one_time_option,
    source_persona_query: record.source_persona_query,
    canonical_guide_url: record.canonical_guide_url,
    canonical_app_store_url: record.canonical_app_store_url,
    app_store_url: coarseAttributionUrl(
      record.app_store_url,
      record.app_store_id,
      record.locale,
    ),
    app_store_cta_label: record.app_store_cta_label,
  };
}

export function validateSnapshotCatalog(payload) {
  exactCoverage(payload);
  if (
    payload.schema_version !== "1.1" ||
    payload.source_identifier !== CATALOG_SOURCE_URL ||
    payload.source_schema !== CATALOG_SCHEMA_URL ||
    payload.source_license !== CATALOG_LICENSE_URL ||
    payload.query_origin !== QUERY_ORIGIN ||
    payload.measured_search_volume !== false ||
    payload.is_ranking !== false ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(payload.date_modified ?? "") ||
    !SHA256.test(payload.source_content_digest ?? "") ||
    !SHA256.test(payload.source_generation_digest ?? "") ||
    !SHA256.test(payload.content_digest ?? "") ||
    !payload.stopwords ||
    typeof payload.stopwords !== "object" ||
    !payload.ui ||
    typeof payload.ui !== "object" ||
    JSON.stringify(Object.keys(payload.stopwords)) !==
      JSON.stringify(OFFICIAL_LOCALES) ||
    JSON.stringify(Object.keys(payload.ui)) !==
      JSON.stringify(OFFICIAL_LOCALES)
  ) {
    throw new Error("Bundled catalog metadata is invalid.");
  }
  if (recordsDigest(payload.records) !== payload.content_digest) {
    throw new Error("Bundled catalog content digest does not match records.");
  }
  for (const locale of OFFICIAL_LOCALES) {
    const stopwords = payload.stopwords[locale];
    if (
      !Array.isArray(stopwords) ||
      !stopwords.length ||
      new Set(stopwords).size !== stopwords.length ||
      stopwords.some(
        (word) =>
          typeof word !== "string" ||
          !word ||
          word.length > 64 ||
          CONTROL_CHARACTERS.test(word),
      )
    ) {
      throw new Error(`Invalid stopwords for '${locale}'.`);
    }
    for (const field of UI_FIELDS) {
      const value = payload.ui[locale]?.[field];
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 2000 ||
        CONTROL_CHARACTERS.test(value)
      ) {
        throw new Error(`Invalid UI field '${locale}.${field}'.`);
      }
    }
  }
  validateRecords(payload.records, "snapshot");
  return payload;
}
