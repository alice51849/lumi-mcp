#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as stopword from "stopword";
import {
  CATALOG_LICENSE_URL,
  CATALOG_SCHEMA_URL,
  CATALOG_SOURCE_URL,
  OFFICIAL_LOCALES,
  QUERY_ORIGIN,
  recordsDigest,
  snapshotRecord,
  validateSnapshotCatalog,
  validateSourceCatalog,
} from "../server/catalog-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CATALOG = CATALOG_SOURCE_URL;
const DEFAULT_I18N =
  "https://raw.githubusercontent.com/alice51849/ios-app-guide/main/" +
  "_engine/geo/publisher_intent_catalog_i18n.json";
const CHECK = process.argv.includes("--check");
const MAX_REMOTE_BYTES = 10_000_000;
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
  free_with_lifetime_unlock: "Free to start · one-time unlock",
});

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
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_REMOTE_BYTES
    ) {
      throw new Error(`${source} exceeds the catalog size limit.`);
    }
    raw = await response.text();
  } else {
    raw = await readFile(path.resolve(source), "utf8");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_REMOTE_BYTES) {
    throw new Error(`${source} exceeds the catalog size limit.`);
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

function validateInputs(catalog, i18n) {
  validateSourceCatalog(catalog);
  if (
    !i18n?.localizations ||
    JSON.stringify(Object.keys(i18n.localizations).sort()) !==
      JSON.stringify([...OFFICIAL_LOCALES].sort())
  ) {
    throw new Error("Publisher UI localizations do not cover all 50 locales.");
  }
  for (const model of new Set(
    catalog.records.map((record) => record.purchase_model),
  )) {
    if (!Object.hasOwn(PURCHASE_LABELS, model)) {
      throw new Error(`Missing localized purchase label source '${model}'.`);
    }
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
      return snapshotRecord(
        record,
        localized(
          mapping,
          PURCHASE_LABELS[record.purchase_model],
        ),
      );
    })
    .sort(
      (left, right) =>
        localeOrder.get(left.locale) - localeOrder.get(right.locale) ||
        left.app_key.localeCompare(right.app_key),
    );
  const snapshot = {
    schema_version: "1.1",
    date_modified: catalog.dateModified,
    source_identifier: CATALOG_SOURCE_URL,
    source_schema: CATALOG_SCHEMA_URL,
    source_license: CATALOG_LICENSE_URL,
    source_content_digest: catalog.content_digest,
    source_generation_digest: catalog.generation_digest,
    query_origin: QUERY_ORIGIN,
    measured_search_volume: false,
    is_ranking: false,
    app_count: catalog.app_count,
    locale_count: catalog.locale_count,
    record_count: catalog.record_count,
    locales: OFFICIAL_LOCALES,
    stopwords: Object.fromEntries(
      OFFICIAL_LOCALES.map((locale) => [locale, normalizedStopwords(locale)]),
    ),
    ui,
    records,
    content_digest: recordsDigest(records),
  };
  validateSnapshotCatalog(snapshot);

  const resourceRoot = path.join(ROOT, "mcpb-resources");
  const catalogPath = path.join(ROOT, "server", "catalog.json");
  const noticePath = path.join(ROOT, "THIRD_PARTY_NOTICES.txt");
  const notice = await readFile(
    path.join(ROOT, "node_modules", "stopword", "dist", "3rd-party.txt"),
    "utf8",
  );
  const expectedResources = new Map(
    [...resources].map(([locale, resource]) => [
      `${locale}.json`,
      stableJson(resource),
    ]),
  );

  if (CHECK) {
    if ((await readFile(catalogPath, "utf8")) !== stableJson(snapshot)) {
      throw new Error(
        "Bundled catalog is stale; run npm run sync:catalog.",
      );
    }
    if ((await readFile(noticePath, "utf8")) !== notice) {
      throw new Error(
        "Third-party notices are stale; run npm run sync:catalog.",
      );
    }
    const existing = (await readdir(resourceRoot))
      .filter((file) => file.endsWith(".json"))
      .sort();
    const expected = [...expectedResources.keys()].sort();
    if (JSON.stringify(existing) !== JSON.stringify(expected)) {
      throw new Error(
        "MCPB locale resources are incomplete or stale.",
      );
    }
    for (const [file, content] of expectedResources) {
      if ((await readFile(path.join(resourceRoot, file), "utf8")) !== content) {
        throw new Error(`MCPB locale resource is stale: ${file}`);
      }
    }
    console.log(
      `Verified live catalog gate: ${snapshot.app_count} apps x ` +
        `${snapshot.locale_count} locales (${snapshot.record_count} records).`,
    );
    return;
  }

  await mkdir(path.join(ROOT, "server"), { recursive: true });
  await mkdir(resourceRoot, { recursive: true });
  await writeFile(catalogPath, stableJson(snapshot), "utf8");
  await writeFile(noticePath, notice, "utf8");
  for (const [file, content] of expectedResources) {
    await writeFile(
      path.join(resourceRoot, file),
      content,
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
