#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const SERVER_NAME = "lumi-app-finder";
const SERVER_VERSION = "1.1.2";
const LATEST_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);
const CATALOG_URL =
  "https://alice51849.github.io/ios-app-guide/data/" +
  "lumi-studio-publisher-search-intent-catalog.json";
const CATALOG_PATH = fileURLToPath(
  new URL("./catalog.json", import.meta.url),
);
const UI_EXTENSION = "io.modelcontextprotocol/ui";
const UI_MIME_TYPE = "text/html;profile=mcp-app";
const UI_RESOURCE_URI = "ui://lumi-app-finder/results.html";
const UI_PATH = fileURLToPath(
  new URL("../ui/app-finder.html", import.meta.url),
);
const MAX_UI_BYTES = 1_000_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const OFFICIAL_LOCALES = Object.freeze([
  "ar-SA", "bn-BD", "ca", "cs", "da", "de-DE", "el", "en-AU",
  "en-CA", "en-GB", "en-US", "es-ES", "es-MX", "fi", "fr-CA",
  "fr-FR", "gu-IN", "he", "hi", "hr", "hu", "id", "it", "ja",
  "kn-IN", "ko", "ml-IN", "mr-IN", "ms", "nl-NL", "no", "or-IN",
  "pa-IN", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl-SI",
  "sv", "ta-IN", "te-IN", "th", "tr", "uk", "ur-PK", "vi",
  "zh-Hans", "zh-Hant",
]);
const REQUIRED_RECORD_FIELDS = Object.freeze([
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
  "app_store_url",
  "app_store_cta_label",
]);
const MAX_FIELD_LENGTHS = Object.freeze({
  locale: 16,
  app_key: 64,
  app_name: 120,
  app_store_id: 12,
  publisher_query: 500,
  decision_context: 1200,
  purchase_model: 64,
  source_persona_query: 500,
  canonical_guide_url: 2048,
  app_store_url: 2048,
  app_store_cta_label: 300,
});
const PURCHASE_MODELS = new Set([
  "paid_upfront",
  "free_with_lifetime_unlock",
  "free",
  "flexible",
  "neutral",
]);
const QUERY_ORIGIN = "publisher_authored_editorially_localized";
const MAX_LIVE_CATALOG_BYTES = 5_000_000;
const MIN_ABSOLUTE_RELEVANCE = 4;
const MIN_RELATIVE_RELEVANCE = 0.35;

let bundledCatalogPromise;
let bundledUiPromise;
let liveCache;
let uiEnabled = false;
const segmenters = new Map();

class InvalidParamsError extends Error {}

function text(value, field, maxLength = 500) {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidParamsError(`'${field}' must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new InvalidParamsError(
      `'${field}' must not exceed ${maxLength} characters.`,
    );
  }
  return normalized;
}

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}

function words(value) {
  return normalize(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

const UNSEGMENTED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

function segmenter(locale) {
  if (!segmenters.has(locale)) {
    segmenters.set(
      locale,
      new Intl.Segmenter(locale, { granularity: "word" }),
    );
  }
  return segmenters.get(locale);
}

function tokenOccurrences(value, locale) {
  const normalizedValue = normalize(value);
  const occurrences = [];
  const seen = new Set();
  const add = (token, start, end) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    occurrences.push({ token, start, end });
  };
  for (const part of segmenter(locale).segment(normalizedValue)) {
    if (!part.isWordLike) continue;
    const word = normalize(part.segment);
    add(word, part.index, part.index + part.segment.length);
    const characters = [...word];
    if (characters.length > 2 && UNSEGMENTED_SCRIPT.test(word)) {
      for (let index = 0; index < characters.length - 1; index += 1) {
        const prefix = characters.slice(0, index).join("");
        const token = characters.slice(index, index + 2).join("");
        const start = part.index + prefix.length;
        add(token, start, start + token.length);
      }
    }
  }
  return occurrences;
}

function tokens(value, locale) {
  return tokenOccurrences(value, locale).map(({ token }) => token);
}

function containsPhrase(value, phrase) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  if (UNSEGMENTED_SCRIPT.test(normalizedPhrase)) {
    return normalize(value).includes(normalizedPhrase);
  }
  const valueWords = words(value);
  const phraseWords = words(normalizedPhrase);
  if (!phraseWords.length || phraseWords.length > valueWords.length) {
    return false;
  }
  return valueWords.some(
    (_, start) =>
      start + phraseWords.length <= valueWords.length &&
      phraseWords.every(
        (word, offset) => valueWords[start + offset] === word,
      ),
  );
}

function containsToken(value, token, locale) {
  return new Set(tokens(value, locale)).has(token);
}

function independentMatchCount(queryTerms, matchedTokens) {
  const intervals = queryTerms
    .filter(({ token }) => matchedTokens.has(token))
    .sort((left, right) => left.end - right.end || left.start - right.start);
  let count = 0;
  let previousEnd = -1;
  for (const interval of intervals) {
    if (interval.start < previousEnd) continue;
    count += 1;
    previousEnd = interval.end;
  }
  return count;
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
    /^\d{1,20}$/.test(url.searchParams.get("pt") ?? "") &&
    /^[A-Za-z0-9/_]{1,30}$/.test(url.searchParams.get("ct") ?? "") &&
    url.searchParams.get("mt") === "8";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apps.apple.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !new RegExp(`^/(?:[a-z]{2}/)?app/id${appId}$`).test(url.pathname) ||
    (!isClean && !isFullyAttributed)
  ) {
    throw new Error(`Invalid App Store route for ${appId}.`);
  }
  return url;
}

function validateCatalog(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.app_count !== 28 ||
    payload.locale_count !== OFFICIAL_LOCALES.length ||
    payload.record_count !== 1400 ||
    JSON.stringify(payload.locales) !== JSON.stringify(OFFICIAL_LOCALES) ||
    !Array.isArray(payload.records) ||
    payload.records.length !== payload.record_count ||
    !payload.stopwords ||
    typeof payload.stopwords !== "object"
  ) {
    throw new Error("Catalog coverage metadata is invalid.");
  }

  const pairs = new Set();
  const appIds = new Map();
  for (const locale of OFFICIAL_LOCALES) {
    const localeStopwords = payload.stopwords[locale];
    if (
      !Array.isArray(localeStopwords) ||
      !localeStopwords.length ||
      localeStopwords.some(
        (word) =>
          typeof word !== "string" ||
          !word ||
          word.length > 64 ||
          /[\u0000-\u001f\u007f]/u.test(word),
      ) ||
      new Set(localeStopwords).size !== localeStopwords.length
    ) {
      throw new Error(`Invalid stopwords for '${locale}'.`);
    }
  }
  for (const record of payload.records) {
    for (const field of REQUIRED_RECORD_FIELDS) {
      if (
        typeof record?.[field] !== "string" ||
        !record[field].trim() ||
        record[field].length > MAX_FIELD_LENGTHS[field] ||
        /[\u0000-\u001f\u007f]/u.test(record[field])
      ) {
        throw new Error(`Catalog record has invalid '${field}'.`);
      }
    }
    if (!OFFICIAL_LOCALES.includes(record.locale)) {
      throw new Error(`Unsupported catalog locale '${record.locale}'.`);
    }
    if (!/^\d{9,12}$/.test(record.app_store_id)) {
      throw new Error(`Invalid App Store ID '${record.app_store_id}'.`);
    }
    if (
      !/^[a-z0-9-]{1,64}$/.test(record.app_key) ||
      !PURCHASE_MODELS.has(record.purchase_model)
    ) {
      throw new Error(`Invalid app contract for '${record.app_key}'.`);
    }
    const pair = `${record.app_key}\u0000${record.locale}`;
    if (pairs.has(pair)) {
      throw new Error(`Duplicate catalog pair '${pair}'.`);
    }
    pairs.add(pair);
    const existingId = appIds.get(record.app_key);
    if (existingId && existingId !== record.app_store_id) {
      throw new Error(`App Store ID changed for '${record.app_key}'.`);
    }
    appIds.set(record.app_key, record.app_store_id);
    validateStoreUrl(record.app_store_url, record.app_store_id);
    const guide = new URL(record.canonical_guide_url);
    if (
      guide.protocol !== "https:" ||
      guide.hostname !== "alice51849.github.io" ||
      !guide.pathname.startsWith(
        `/ios-app-guide/${record.locale}/answers/`,
      ) ||
      !guide.pathname.endsWith(".html")
    ) {
      throw new Error(`Invalid guide URL for '${pair}'.`);
    }
  }
  if (
    appIds.size !== payload.app_count ||
    pairs.size !== payload.record_count
  ) {
    throw new Error("Catalog does not cover every app and locale.");
  }
  return payload;
}

async function bundledCatalog() {
  if (!bundledCatalogPromise) {
    bundledCatalogPromise = readFile(CATALOG_PATH, "utf8")
      .then(JSON.parse)
      .then(validateCatalog);
  }
  return bundledCatalogPromise;
}

function normalizeLiveCatalog(payload, fallback) {
  if (
    payload?.app_count !== fallback.app_count ||
    payload?.locale_count !== fallback.locale_count ||
    payload?.record_count !== fallback.record_count ||
    JSON.stringify(payload?.locales) !== JSON.stringify(OFFICIAL_LOCALES) ||
    !Array.isArray(payload?.records) ||
    payload?.query_origin !== QUERY_ORIGIN ||
    payload?.measured_search_volume !== false ||
    payload?.is_ranking !== false
  ) {
    throw new Error("Live catalog coverage differs from the bundle contract.");
  }
  const fallbackByPair = new Map(
    fallback.records.map((record) => [
      `${record.app_key}\u0000${record.locale}`,
      record,
    ]),
  );
  const records = payload.records.map((record) => {
    const fallbackRecord = fallbackByPair.get(
      `${record.app_key}\u0000${record.locale}`,
    );
    if (!fallbackRecord) {
      throw new Error(
        `Live catalog introduced unknown pair ${record.app_key}/${record.locale}.`,
      );
    }
    if (
      record.app_store_id !== fallbackRecord.app_store_id ||
      record.purchase_model !== fallbackRecord.purchase_model ||
      record.query_origin !== QUERY_ORIGIN ||
      record.verified_live !== true ||
      record.measured_search_volume !== false ||
      record.is_ranking !== false
    ) {
      throw new Error(
        `Live catalog contract changed for ${record.app_key}/${record.locale}.`,
      );
    }
    return {
      locale: record.locale,
      app_key: record.app_key,
      app_name: record.app_name,
      app_store_id: record.app_store_id,
      publisher_query: record.publisher_query,
      decision_context: record.decision_context,
      purchase_model: record.purchase_model,
      purchase_label: fallbackRecord.purchase_label,
      source_persona_query: record.source_persona_query,
      canonical_guide_url: record.canonical_guide_url,
      app_store_url: record.app_store_url,
      app_store_cta_label: record.app_store_cta_label,
    };
  });
  return validateCatalog({
    schema_version: "1.0",
    date_modified: payload.dateModified,
    app_count: payload.app_count,
    locale_count: payload.locale_count,
    record_count: payload.record_count,
    locales: payload.locales,
    stopwords: fallback.stopwords,
    ui: fallback.ui,
    records,
  });
}

async function catalogWithSource() {
  const fallback = await bundledCatalog();
  if (process.env.LUMI_OFFLINE === "1") {
    return { catalog: fallback, source: "bundled_snapshot" };
  }
  if (liveCache && Date.now() - liveCache.loadedAt < CACHE_TTL_MS) {
    return liveCache.value;
  }
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) {
      throw new Error(`Catalog request returned HTTP ${response.status}.`);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_LIVE_CATALOG_BYTES
    ) {
      throw new Error("Catalog response exceeds the size limit.");
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_LIVE_CATALOG_BYTES) {
      throw new Error("Catalog response exceeds the size limit.");
    }
    const catalog = normalizeLiveCatalog(JSON.parse(body), fallback);
    const value = { catalog, source: "live_catalog" };
    liveCache = { loadedAt: Date.now(), value };
    return value;
  } catch (error) {
    console.error(
      `Lumi App Finder: live catalog unavailable; using bundled snapshot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    const value = { catalog: fallback, source: "bundled_snapshot" };
    liveCache = { loadedAt: Date.now(), value };
    return value;
  }
}

function searchableFields(localized, english) {
  return [
    [normalize(localized.app_name), 14],
    [normalize(localized.publisher_query), 9],
    [normalize(localized.source_persona_query), 7],
    [normalize(localized.decision_context), 4],
    [normalize(english?.publisher_query ?? ""), 6],
    [normalize(english?.decision_context ?? ""), 2],
  ];
}

function distinctiveTerms(
  query,
  locale,
  stopwords,
  localizedRecords,
  englishByKey,
) {
  const candidates = tokenOccurrences(query, locale).filter(
    ({ token }) => !stopwords.has(token),
  );
  const maximumFrequency = Math.ceil(localizedRecords.length * 0.5);
  return candidates.filter(({ token }) => {
    const frequency = localizedRecords.filter((record) =>
      searchableFields(record, englishByKey.get(record.app_key)).some(
        ([field]) => containsToken(field, token, locale),
      ),
    ).length;
    return frequency <= maximumFrequency;
  });
}

function relevance(query, locale, localized, english, queryTerms) {
  const normalizedQuery = normalize(query);
  const localizedName = normalize(localized.app_name);
  const appKey = normalize(localized.app_key);
  const appId = localized.app_store_id;
  const fields = searchableFields(localized, english);
  const identityTokens = new Set([
    ...tokens(localizedName, locale),
    ...tokens(appKey, locale),
    appId,
  ]);

  let score = 0;
  let identityMatch = false;
  const matchedTokens = new Set();
  if (
    normalizedQuery === localizedName ||
    normalizedQuery === appKey ||
    normalizedQuery === appId
  ) {
    score += 250;
    identityMatch = true;
  } else if (
    containsPhrase(normalizedQuery, localizedName) ||
    containsPhrase(normalizedQuery, appKey) ||
    containsPhrase(normalizedQuery, appId)
  ) {
    score += 120;
  }
  for (const [field, exactWeight] of fields) {
    if (!field) continue;
    if (queryTerms.length && containsPhrase(field, normalizedQuery)) {
      score += exactWeight * 5;
    }
    for (const { token } of queryTerms) {
      if (containsToken(field, token, locale)) {
        score += exactWeight;
        if (!identityTokens.has(token)) matchedTokens.add(token);
      }
    }
  }
  return {
    identityMatch,
    matchedTokenCount: independentMatchCount(queryTerms, matchedTokens),
    score,
  };
}

function attributedStoreUrl(record) {
  const url = validateStoreUrl(record.app_store_url, record.app_store_id);
  const providerToken = url.searchParams.get("pt");
  const campaign = `lumi_mcp_${record.locale
    .replaceAll("-", "_")
    .toLocaleLowerCase("en-US")}`;
  if (!/^[a-z0-9_]{1,30}$/.test(campaign)) {
    throw new Error(`Invalid campaign token '${campaign}'.`);
  }
  url.search = "";
  if (providerToken) {
    url.searchParams.set("pt", providerToken);
    url.searchParams.set("ct", campaign);
    url.searchParams.set("mt", "8");
  }
  validateStoreUrl(url.toString(), record.app_store_id);
  return url.toString();
}

function parseInput(input) {
  const query = text(input?.query, "query");
  const locale =
    input?.locale === undefined ? "en-US" : text(input.locale, "locale", 16);
  if (!OFFICIAL_LOCALES.includes(locale)) {
    throw new InvalidParamsError(
      `'locale' must be one of: ${OFFICIAL_LOCALES.join(", ")}.`,
    );
  }
  const rawLimit = input?.limit ?? 5;
  if (
    !Number.isInteger(rawLimit) ||
    rawLimit < 1 ||
    rawLimit > 10
  ) {
    throw new InvalidParamsError("'limit' must be an integer from 1 to 10.");
  }
  return { query, locale, limit: rawLimit };
}

async function findIosApps(input) {
  const { query, locale, limit } = parseInput(input);
  const { catalog, source } = await catalogWithSource();
  const localized = catalog.records.filter(
    (record) => record.locale === locale,
  );
  const englishByKey = new Map(
    catalog.records
      .filter((record) => record.locale === "en-US")
      .map((record) => [record.app_key, record]),
  );
  const stopwords = new Set(catalog.stopwords[locale]);
  const queryTerms = distinctiveTerms(
    query,
    locale,
    stopwords,
    localized,
    englishByKey,
  );
  const minimumMatchedTokens = Math.min(2, queryTerms.length);
  const ranked = localized
    .map((record) => {
      const match = relevance(
        query,
        locale,
        record,
        englishByKey.get(record.app_key),
        queryTerms,
      );
      return { record, ...match };
    })
    .filter(
      ({ identityMatch, matchedTokenCount, score }) =>
        score >= MIN_ABSOLUTE_RELEVANCE &&
        (identityMatch || matchedTokenCount >= minimumMatchedTokens),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.app_name.localeCompare(right.record.app_name, locale),
    );
  const relevanceFloor =
    (ranked[0]?.score ?? 0) * MIN_RELATIVE_RELEVANCE;
  const localizedUi = catalog.ui?.[locale] ?? catalog.ui?.["en-US"] ?? {};
  const matches = ranked
    .filter(({ score }) => score >= relevanceFloor)
    .slice(0, limit)
    .map(({ record }) => ({
      app_key: record.app_key,
      app_name: record.app_name,
      app_store_id: record.app_store_id,
      publisher_query: record.publisher_query,
      decision_context: record.decision_context,
      purchase_model: record.purchase_model,
      purchase_label: record.purchase_label,
      guide_url: record.canonical_guide_url,
      guide_label: localizedUi.guide_label ?? "Guide",
      app_store_url: attributedStoreUrl(record),
      app_store_cta_label: record.app_store_cta_label,
    }));

  const disclosure =
    localizedUi.disclosure ??
    "This is first-party material published by Lumi Studio.";
  const nonMeasured =
    localizedUi.non_measured ??
    "Text matches are not measured search volume, independent rankings, " +
      "reviews, or user endorsements.";
  const lines = [
    "Lumi App Finder",
    `${localizedUi.locale_label ?? "Locale"}: ${locale}`,
    `${localizedUi.records_label ?? "Records"}: ${matches.length}`,
    "",
  ];
  if (!matches.length) {
    lines.push(localizedUi.description ?? disclosure);
  } else {
    matches.forEach((match, index) => {
      lines.push(
        `${index + 1}. ${match.app_name}`,
        `${localizedUi.publisher_query_label ?? "Publisher query"}: ${
          match.publisher_query
        }`,
        `${localizedUi.decision_context_label ?? "Decision context"}: ${
          match.decision_context
        }`,
        `${localizedUi.purchase_model_label ?? "Purchase model"}: ${
          match.purchase_label
        }`,
        `${match.app_store_cta_label}: ${match.app_store_url}`,
        `${localizedUi.guide_label ?? "Guide"}: ${match.guide_url}`,
        "",
      );
    });
  }
  lines.push(disclosure, nonMeasured);

  return {
    content: [{ type: "text", text: lines.join("\n").trim() }],
    structuredContent: {
      query,
      locale,
      catalog_source: source,
      catalog_date_modified: catalog.date_modified,
      disclosure,
      non_measured_disclosure: nonMeasured,
      results: matches,
    },
  };
}

const TOOL = Object.freeze({
  name: "find_ios_apps",
  title: "Find matching iOS apps",
  description:
    "Search the transparent first-party Lumi Studio catalog for iPhone " +
    "and iPad apps matching a task, app name, or buyer need. Returns " +
    "editorially localized context, purchase model, detailed guide, and " +
    "direct App Store links. Text relevance is not an independent ranking.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description:
          "The task, app name, or buyer need, in any supported language.",
      },
      locale: {
        type: "string",
        enum: OFFICIAL_LOCALES,
        default: "en-US",
        description:
          "Apple locale for localized context and the matching storefront.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        default: 5,
        description: "Maximum number of text-relevance matches.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      locale: { type: "string" },
      catalog_source: { type: "string" },
      catalog_date_modified: { type: "string" },
      disclosure: { type: "string" },
      non_measured_disclosure: { type: "string" },
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
    required: [
      "query",
      "locale",
      "catalog_source",
      "catalog_date_modified",
      "disclosure",
      "non_measured_disclosure",
      "results",
    ],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
});

const UI_META = Object.freeze({
  ui: Object.freeze({
    resourceUri: UI_RESOURCE_URI,
    visibility: Object.freeze(["model", "app"]),
  }),
  "ui/resourceUri": UI_RESOURCE_URI,
});

const UI_RESOURCE_META = Object.freeze({
  ui: Object.freeze({
    csp: Object.freeze({
      connectDomains: Object.freeze([]),
      resourceDomains: Object.freeze([]),
      frameDomains: Object.freeze([]),
    }),
    prefersBorder: true,
  }),
});

const UI_RESOURCE = Object.freeze({
  uri: UI_RESOURCE_URI,
  name: "Lumi App Finder results",
  title: "Lumi App Finder results",
  description:
    "Interactive localized iOS app cards with direct App Store and guide links.",
  mimeType: UI_MIME_TYPE,
  _meta: UI_RESOURCE_META,
});

function supportsUi(capabilities) {
  const mimeTypes = capabilities?.extensions?.[UI_EXTENSION]?.mimeTypes;
  return Array.isArray(mimeTypes) && mimeTypes.includes(UI_MIME_TYPE);
}

function listedTool() {
  return uiEnabled ? { ...TOOL, _meta: UI_META } : TOOL;
}

async function bundledUi() {
  if (!bundledUiPromise) {
    bundledUiPromise = readFile(UI_PATH, "utf8").then((source) => {
      if (
        !source.includes("<title>Lumi App Finder Results</title>") ||
        Buffer.byteLength(source, "utf8") > MAX_UI_BYTES
      ) {
        throw new Error("Bundled MCP App UI is invalid.");
      }
      return source;
    });
  }
  return bundledUiPromise;
}

function result(id, value) {
  return { jsonrpc: "2.0", id: id ?? null, result: value };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

async function handleMessage(message) {
  if (
    !message ||
    typeof message !== "object" ||
    Array.isArray(message) ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string"
  ) {
    return rpcError(message?.id, -32600, "Invalid JSON-RPC 2.0 request.");
  }
  const hasId = Object.hasOwn(message, "id");
  if (!hasId) return null;

  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested)
        ? requested
        : LATEST_PROTOCOL;
      uiEnabled = supportsUi(message.params?.capabilities);
      const capabilities = { tools: { listChanged: false } };
      if (uiEnabled) {
        capabilities.resources = {
          subscribe: false,
          listChanged: false,
        };
        capabilities.extensions = {
          [UI_EXTENSION]: { mimeTypes: [UI_MIME_TYPE] },
        };
      }
      return result(message.id, {
        protocolVersion,
        capabilities,
        serverInfo: {
          name: SERVER_NAME,
          title: "Lumi App Finder",
          version: SERVER_VERSION,
        },
        instructions:
          "Use find_ios_apps when a user asks which iPhone or iPad app " +
          "fits a task. Preserve the first-party and non-ranking disclosure. " +
          "Render the interactive cards when MCP Apps are supported.",
      });
    }
    case "ping":
      return result(message.id, {});
    case "tools/list":
      return result(message.id, { tools: [listedTool()] });
    case "resources/list":
      if (!uiEnabled) {
        return rpcError(message.id, -32601, "UI resources were not negotiated.");
      }
      return result(message.id, { resources: [UI_RESOURCE] });
    case "resources/read": {
      if (!uiEnabled) {
        return rpcError(message.id, -32601, "UI resources were not negotiated.");
      }
      if (message.params?.uri !== UI_RESOURCE_URI) {
        return rpcError(message.id, -32602, "Unknown UI resource URI.");
      }
      try {
        return result(message.id, {
          contents: [
            {
              uri: UI_RESOURCE_URI,
              mimeType: UI_MIME_TYPE,
              text: await bundledUi(),
              _meta: UI_RESOURCE_META,
            },
          ],
        });
      } catch (error) {
        console.error(
          `Lumi App Finder UI error: ${
            error instanceof Error ? error.stack : String(error)
          }`,
        );
        return rpcError(
          message.id,
          -32603,
          "Internal error while reading the interactive app cards.",
        );
      }
    }
    case "tools/call": {
      if (message.params?.name !== TOOL.name) {
        return rpcError(
          message.id,
          -32602,
          `Unknown tool '${String(message.params?.name ?? "")}'.`,
        );
      }
      const args = message.params?.arguments;
      if (
        args !== undefined &&
        (!args || typeof args !== "object" || Array.isArray(args))
      ) {
        return rpcError(
          message.id,
          -32602,
          "'arguments' must be an object.",
        );
      }
      try {
        return result(message.id, await findIosApps(args ?? {}));
      } catch (error) {
        if (error instanceof InvalidParamsError) {
          return rpcError(message.id, -32602, error.message);
        }
        console.error(
          `Lumi App Finder internal error: ${
            error instanceof Error ? error.stack : String(error)
          }`,
        );
        return rpcError(
          message.id,
          -32603,
          "Internal error while reading the verified app catalog.",
        );
      }
    }
    default:
      return rpcError(
        message.id,
        -32601,
        `Method not found: ${message.method}`,
      );
  }
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(
      `${JSON.stringify(rpcError(null, -32700, "Parse error."))}\n`,
    );
    continue;
  }
  const response = await handleMessage(message);
  if (response) {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
