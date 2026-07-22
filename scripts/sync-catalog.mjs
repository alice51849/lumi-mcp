#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as stopword from "stopword";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CATALOG =
  "https://raw.githubusercontent.com/alice51849/ios-app-guide/main/data/" +
  "lumi-studio-publisher-search-intent-catalog.json";
const DEFAULT_I18N =
  "https://raw.githubusercontent.com/alice51849/ios-app-guide/main/" +
  "_engine/geo/publisher_intent_catalog_i18n.json";
const OFFICIAL_LOCALES = Object.freeze([
  "ar-SA", "bn-BD", "ca", "cs", "da", "de-DE", "el", "en-AU",
  "en-CA", "en-GB", "en-US", "es-ES", "es-MX", "fi", "fr-CA",
  "fr-FR", "gu-IN", "he", "hi", "hr", "hu", "id", "it", "ja",
  "kn-IN", "ko", "ml-IN", "mr-IN", "ms", "nl-NL", "no", "or-IN",
  "pa-IN", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl-SI",
  "sv", "ta-IN", "te-IN", "th", "tr", "uk", "ur-PK", "vi",
  "zh-Hans", "zh-Hant",
]);
const EXPECTED_APP_COUNT = 29;
const EXPECTED_RECORD_COUNT = EXPECTED_APP_COUNT * OFFICIAL_LOCALES.length;
const STOPWORD_EXPORTS = Object.freeze({
  "ar-SA": "ara",
  "bn-BD": "ben",
  ca: "cat",
  cs: "ces",
  da: "dan",
  "de-DE": "deu",
  el: "ell",
  "en-AU": "eng",
  "en-CA": "eng",
  "en-GB": "eng",
  "en-US": "eng",
  "es-ES": "spa",
  "es-MX": "spa",
  fi: "fin",
  "fr-CA": "fra",
  "fr-FR": "fra",
  "gu-IN": "guj",
  he: "heb",
  hi: "hin",
  hr: "hrv",
  hu: "hun",
  id: "ind",
  it: "ita",
  ja: "jpn",
  ko: "kor",
  "mr-IN": "mar",
  ms: "msa",
  "nl-NL": "nld",
  no: "nob",
  "pa-IN": "panGu",
  pl: "pol",
  "pt-BR": "porBr",
  "pt-PT": "por",
  ro: "ron",
  ru: "rus",
  sk: "slk",
  "sl-SI": "slv",
  sv: "swe",
  th: "tha",
  tr: "tur",
  uk: "ukr",
  "ur-PK": "urd",
  vi: "vie",
  "zh-Hans": "zho",
  "zh-Hant": "zho",
});
const MANUAL_STOPWORDS = Object.freeze({
  "kn-IN": [
    "ಅದು", "ಅವರು", "ಅವಳು", "ಅವನು", "ಅಥವಾ", "ಆ", "ಆದರೆ", "ಆಗಿ",
    "ಇದು", "ಇದೆ", "ಇವೆ", "ಈ", "ಎಂದು", "ಎಂಬ", "ಒಂದು", "ಕೂಡ", "ಗೆ",
    "ಜೊತೆ", "ನ", "ನಲ್ಲಿ", "ನಾವು", "ನೀವು", "ಬಗ್ಗೆ", "ಮತ್ತು", "ಮೂಲಕ",
    "ಮೇಲೆ", "ರಿಂದ", "ಸಹ", "ಹಾಗೂ", "ಹೇಗೆ", "ಏಕೆ", "ಏನು",
  ],
  "ml-IN": [
    "അത്", "അല്ല", "അല്ലെങ്കിൽ", "അവൻ", "അവൾ", "അവർ", "ആ", "ആണ്",
    "ആയ", "ഇത്", "ഇല്ല", "ഈ", "എങ്ങനെ", "എന്ത്", "എന്തിന്", "എന്ന്",
    "എന്ന", "എന്നാൽ", "ഒരു", "കൂടാതെ", "നാം", "നിങ്ങൾ", "മുതൽ",
    "മൂലം", "വരെ", "വേണ്ടി",
  ],
  "or-IN": [
    "ଏକ", "ଏବଂ", "ଏହା", "ଏହି", "କଣ", "କାହିଁକି", "କିପରି", "କିମ୍ବା",
    "କିନ୍ତୁ", "କୁ", "ଠାରୁ", "ତାହା", "ନାହିଁ", "ପାଇଁ", "ମଧ୍ୟ", "ମୁଁ",
    "ର", "ରେ", "ସହ", "ସେ", "ସେହି", "ଆମେ", "ଆପଣ", "ଅଛି", "ଯେ",
  ],
  "ta-IN": [
    "அது", "அந்த", "அவர்", "அவர்கள்", "ஆகும்", "ஆனால்", "இது", "இந்த",
    "இல்லை", "இல்", "உடன்", "உள்ள", "என்று", "என", "எப்படி", "என்ன",
    "ஏன்", "ஒரு", "க்கு", "நாம்", "நீங்கள்", "பற்றி", "மற்றும்", "மூலம்",
    "வரை", "இருந்து", "அல்லது",
  ],
  "te-IN": [
    "అది", "అతను", "ఆ", "ఆమె", "ఇది", "ఈ", "ఎందుకు", "ఎలా", "ఏమి",
    "ఒక", "కానీ", "కి", "కు", "గురించి", "తో", "నుండి", "లేదు", "లో",
    "వరకు", "వారు", "మనము", "మీరు", "మరియు", "కోసం", "ద్వారా", "లేదా",
    "ఉంది", "అని",
  ],
});
const NAME = "Lumi Studio Publisher Search Intent Catalog";
const DESCRIPTION =
  "A first-party catalog of who each app is designed for, the task they " +
  "are trying to complete, and the direct App Store path.";
const DISCLOSURE =
  "This is first-party material published by Lumi Studio, the developer " +
  "of every listed app.";
const NON_MEASURED =
  "The queries are editorial descriptions of intended use cases, not " +
  "measured search-volume data, rankings, independent reviews, or user " +
  "endorsements.";
const PURCHASE_LABELS = Object.freeze({
  paid_upfront: "Paid download",
  free_with_lifetime_unlock: "Free to start · lifetime unlock",
  free: "Free",
  flexible: "Flexible · check listing",
  neutral: "Check current listing",
});
const RECORD_FIELDS = Object.freeze([
  "locale",
  "app_key",
  "app_name",
  "app_store_id",
  "publisher_query",
  "decision_context",
  "purchase_model",
  "source_persona_query",
  "canonical_guide_url",
  "app_store_url",
  "app_store_cta_label",
]);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1]) {
    throw new Error(`${name} requires a path or URL.`);
  }
  return process.argv[index + 1];
}

async function loadJson(source) {
  let raw;
  if (/^https:\/\//.test(source)) {
    const response = await fetch(source, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`${source} returned HTTP ${response.status}.`);
    }
    raw = await response.text();
  } else {
    raw = await readFile(path.resolve(source), "utf8");
  }
  return JSON.parse(raw);
}

function localized(mapping, source) {
  const value = mapping?.[source];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing localization for '${source}'.`);
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

function validateInputs(catalog, i18n) {
  if (
    catalog?.app_count !== EXPECTED_APP_COUNT ||
    catalog?.locale_count !== OFFICIAL_LOCALES.length ||
    catalog?.record_count !== EXPECTED_RECORD_COUNT ||
    JSON.stringify(catalog?.locales) !== JSON.stringify(OFFICIAL_LOCALES) ||
    !Array.isArray(catalog?.records) ||
    catalog.records.length !== catalog.record_count
  ) {
    throw new Error(
      `Publisher catalog coverage is not ${EXPECTED_APP_COUNT} × ` +
        `${OFFICIAL_LOCALES.length}.`,
    );
  }
  if (
    !i18n?.localizations ||
    JSON.stringify(Object.keys(i18n.localizations).sort()) !==
      JSON.stringify([...OFFICIAL_LOCALES].sort())
  ) {
    throw new Error("Publisher UI localizations do not cover all 50 locales.");
  }

  const pairs = new Set();
  const appKeys = new Set();
  for (const record of catalog.records) {
    for (const field of RECORD_FIELDS) {
      if (typeof record?.[field] !== "string" || !record[field].trim()) {
        throw new Error(`Invalid publisher record field '${field}'.`);
      }
    }
    if (
      record.verified_live !== true ||
      record.measured_search_volume !== false ||
      record.is_ranking !== false ||
      !OFFICIAL_LOCALES.includes(record.locale) ||
      !/^\d{9,12}$/.test(record.app_store_id) ||
      !Object.hasOwn(PURCHASE_LABELS, record.purchase_model)
    ) {
      throw new Error(
        `Invalid publisher contract for ${record.app_key}/${record.locale}.`,
      );
    }
    const pair = `${record.app_key}\u0000${record.locale}`;
    if (pairs.has(pair)) throw new Error(`Duplicate pair '${pair}'.`);
    pairs.add(pair);
    appKeys.add(record.app_key);
    try {
      validateStoreUrl(record.app_store_url, record.app_store_id);
      validateGuideUrl(
        record.canonical_guide_url,
        record.locale,
        record.app_key,
      );
    } catch {
      throw new Error(`Invalid owned destination for '${pair}'.`);
    }
  }
  if (
    pairs.size !== EXPECTED_RECORD_COUNT ||
    appKeys.size !== EXPECTED_APP_COUNT
  ) {
    throw new Error("Publisher records do not cover every app/locale pair.");
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizedStopwords(locale) {
  const exportName = STOPWORD_EXPORTS[locale];
  const source = exportName ? stopword[exportName] : MANUAL_STOPWORDS[locale];
  if (!Array.isArray(source) || !source.length) {
    throw new Error(`Missing stopwords for '${locale}'.`);
  }
  return [...new Set(
    source
      .map((value) =>
        String(value).normalize("NFKC").toLocaleLowerCase("en-US").trim(),
      )
      .filter((value) => value && !/[\u0000-\u001f\u007f]/u.test(value)),
  )].sort((left, right) => left.localeCompare(right, locale));
}

async function main() {
  const catalogSource = option("--catalog", DEFAULT_CATALOG);
  const i18nSource = option("--i18n", DEFAULT_I18N);
  const [catalog, i18n] = await Promise.all([
    loadJson(catalogSource),
    loadJson(i18nSource),
  ]);
  validateInputs(catalog, i18n);

  const ui = {};
  const resources = new Map();
  for (const locale of OFFICIAL_LOCALES) {
    const mapping = i18n.localizations[locale];
    const description = localized(mapping, DESCRIPTION);
    const disclosure = localized(mapping, DISCLOSURE);
    const nonMeasured = localized(mapping, NON_MEASURED);
    ui[locale] = {
      description,
      disclosure,
      non_measured: nonMeasured,
      locale_label: localized(mapping, "Locale"),
      records_label: localized(mapping, "Records"),
      publisher_query_label: localized(mapping, "Publisher query"),
      decision_context_label: localized(mapping, "Decision context"),
      purchase_model_label: localized(mapping, "Purchase model"),
      guide_label: localized(mapping, "Guide"),
    };
    resources.set(locale, {
      display_name: localized(mapping, NAME),
      description,
      long_description: `${description} ${disclosure} ${nonMeasured}`,
      tools: [
        {
          name: "find_ios_apps",
          description,
        },
      ],
      keywords: [
        localized(mapping, "App"),
        localized(mapping, "Publisher query"),
        localized(mapping, "Decision context"),
        localized(mapping, "Purchase model"),
        localized(mapping, "Guide"),
        localized(mapping, "Locale"),
      ],
    });
  }

  const localeOrder = new Map(
    OFFICIAL_LOCALES.map((locale, index) => [locale, index]),
  );
  const records = catalog.records
    .map((record) => {
      const mapping = i18n.localizations[record.locale];
      return {
        ...Object.fromEntries(
          RECORD_FIELDS.map((field) => [field, record[field]]),
        ),
        purchase_label: localized(
          mapping,
          PURCHASE_LABELS[record.purchase_model],
        ),
      };
    })
    .sort(
      (left, right) =>
        localeOrder.get(left.locale) - localeOrder.get(right.locale) ||
        left.app_key.localeCompare(right.app_key),
    );
  const snapshot = {
    schema_version: "1.0",
    date_modified: catalog.dateModified,
    app_count: catalog.app_count,
    locale_count: catalog.locale_count,
    record_count: catalog.record_count,
    locales: OFFICIAL_LOCALES,
    stopwords: Object.fromEntries(
      OFFICIAL_LOCALES.map((locale) => [locale, normalizedStopwords(locale)]),
    ),
    ui,
    records,
  };

  const resourceRoot = path.join(ROOT, "mcpb-resources");
  await mkdir(path.join(ROOT, "server"), { recursive: true });
  await mkdir(resourceRoot, { recursive: true });
  await writeFile(
    path.join(ROOT, "server", "catalog.json"),
    stableJson(snapshot),
    "utf8",
  );
  await writeFile(
    path.join(ROOT, "THIRD_PARTY_NOTICES.txt"),
    await readFile(
      path.join(ROOT, "node_modules", "stopword", "dist", "3rd-party.txt"),
      "utf8",
    ),
    "utf8",
  );
  for (const [locale, resource] of resources) {
    await writeFile(
      path.join(resourceRoot, `${locale}.json`),
      stableJson(resource),
      "utf8",
    );
  }
  for (const file of await readdir(resourceRoot)) {
    if (
      file.endsWith(".json") &&
      !OFFICIAL_LOCALES.includes(file.slice(0, -5))
    ) {
      await rm(path.join(resourceRoot, file));
    }
  }
  console.log(
    `Synced ${snapshot.app_count} apps × ${snapshot.locale_count} locales ` +
      `(${snapshot.record_count} records, ${resources.size} MCPB resources).`,
  );
}

await main();
