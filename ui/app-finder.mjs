import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import statusMessages from "./status-messages.json";

const RTL_LOCALES = new Set(["ar-SA", "he", "ur-PK"]);
const STATUS_MESSAGES = Object.freeze(statusMessages);
const main = document.querySelector("main");
const header = document.querySelector("header");
const grid = document.querySelector("#results");
const footer = document.querySelector("footer");
const localeBadge = document.querySelector("#locale");
const state = document.querySelector("#state");
let activeLocale = resolveLocale(navigator.language);
let resultLocale;

const app = new App(
  { name: "Lumi App Finder Results", version: "1.0.2" },
  { availableDisplayModes: ["inline", "fullscreen"] },
  { autoResize: true, strict: true },
);

function safeString(value, maximum = 2048) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function resolveLocale(value) {
  const requested = typeof value === "string"
    ? value.trim().replaceAll("_", "-")
    : "";
  const exact = Object.keys(STATUS_MESSAGES).find(
    (locale) => locale.toLowerCase() === requested.toLowerCase(),
  );
  if (exact) return exact;
  const lower = requested.toLowerCase();
  if (lower.startsWith("zh-hant") || /^zh-(?:hk|mo|tw)\b/u.test(lower)) {
    return "zh-Hant";
  }
  if (lower.startsWith("zh")) return "zh-Hans";
  const language = lower.split("-")[0];
  const defaultLocale = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    pt: "pt-PT",
  }[language];
  return defaultLocale ??
    Object.keys(STATUS_MESSAGES).find(
      (locale) => locale.toLowerCase().split("-")[0] === language,
    ) ??
    "en-US";
}

function applyLocale(locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

function safeStoreUrl(value) {
  try {
    const url = new URL(value);
    const params = [...url.searchParams.entries()];
    const keys = new Set(params.map(([key]) => key));
    const clean = params.length === 0;
    const fullyAttributed =
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
      !/^\/(?:[a-z]{2}\/)?app\/id\d{9,12}$/u.test(url.pathname) ||
      (!clean && !fullyAttributed)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeGuideUrl(value, locale) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "alice51849.github.io" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(`/ios-app-guide/${locale}/answers/`) ||
      !url.pathname.endsWith(".html")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  element.title = value;
  return element;
}

function colorFor(value) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)) % 360;
  }
  return `hsl(${hash} 68% 52%)`;
}

function showFallback(card, url) {
  let fallback = card.querySelector(".fallback");
  if (!fallback) {
    fallback = textElement("code", "fallback", url);
    card.append(fallback);
  }
  fallback.hidden = false;
}

function linkButton(card, label, url, kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `action ${kind}`;
  button.textContent = label;
  button.title = url;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await app.openLink(
        { url },
        { signal: AbortSignal.timeout(7000) },
      );
      if (response.isError) showFallback(card, url);
    } catch {
      showFallback(card, url);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function normalizedResult(value, locale) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const appKey = safeString(value.app_key, 64);
  const appName = safeString(value.app_name, 120);
  const query = safeString(value.publisher_query, 500);
  const context = safeString(value.decision_context, 1200);
  const purchase = safeString(value.purchase_label, 300);
  const storeLabel = safeString(value.app_store_cta_label, 300);
  const guideLabel = safeString(value.guide_label, 300);
  const storeUrl = safeStoreUrl(value.app_store_url);
  const guideUrl = safeGuideUrl(value.guide_url, locale);
  if (
    !appKey ||
    !appName ||
    !query ||
    !context ||
    !purchase ||
    !storeLabel ||
    !guideLabel ||
    !storeUrl ||
    !guideUrl
  ) {
    return null;
  }
  return {
    appKey,
    appName,
    query,
    context,
    purchase,
    storeLabel,
    guideLabel,
    storeUrl,
    guideUrl,
  };
}

function resultCard(result) {
  const card = document.createElement("article");
  card.className = "card";

  const identity = document.createElement("div");
  identity.className = "identity";
  const mark = textElement("span", "mark", [...result.appName][0] ?? "L");
  mark.style.setProperty("--accent", colorFor(result.appKey));
  const heading = document.createElement("div");
  heading.className = "heading";
  heading.append(
    textElement("h2", "name", result.appName),
    textElement("span", "purchase", result.purchase),
  );
  identity.append(mark, heading);

  const intent = textElement("p", "intent", result.query);
  const context = textElement("p", "context", result.context);
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    linkButton(card, result.storeLabel, result.storeUrl, "store"),
    linkButton(card, result.guideLabel, result.guideUrl, "guide"),
  );
  card.append(identity, intent, context, actions);
  return card;
}

function showTerminalState(kind, detail) {
  const message = STATUS_MESSAGES[activeLocale]?.[kind] ??
    STATUS_MESSAGES["en-US"][kind];
  applyLocale(activeLocale);
  header.hidden = true;
  footer.hidden = true;
  grid.hidden = true;
  state.textContent = message;
  state.title = message;
  state.setAttribute("role", kind === "error" ? "alert" : "status");
  state.hidden = false;
  main.dataset.ready = "true";
  if (kind === "error") main.dataset.error = "true";
  else delete main.dataset.error;
  main.setAttribute("aria-busy", "false");
  if (kind === "error") console.error("Lumi App Finder UI error:", detail);
}

function render(result) {
  if (result?.isError) {
    showTerminalState("error", result.content);
    return;
  }
  const payload = result?.structuredContent;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    showTerminalState("error", "Missing structured tool result.");
    return;
  }
  const locale = safeString(payload.locale, 16);
  const disclosure = safeString(payload.disclosure, 1200);
  const nonMeasured = safeString(payload.non_measured_disclosure, 1200);
  if (
    !locale ||
    !Object.hasOwn(STATUS_MESSAGES, locale) ||
    !disclosure ||
    !nonMeasured
  ) {
    showTerminalState("error", "Invalid structured tool result.");
    return;
  }

  const results = Array.isArray(payload.results)
    ? payload.results
        .map((value) => normalizedResult(value, locale))
        .filter(Boolean)
    : [];
  activeLocale = locale;
  resultLocale = locale;
  applyLocale(locale);
  localeBadge.textContent = `${locale} · ${results.length}`;
  localeBadge.title = locale;
  grid.replaceChildren(...results.map(resultCard));
  if (!results.length) {
    grid.append(textElement("p", "empty", disclosure));
  }
  footer.replaceChildren(
    textElement("p", "disclosure", disclosure),
    textElement("p", "non-measured", nonMeasured),
  );
  header.hidden = false;
  footer.hidden = false;
  grid.hidden = false;
  state.hidden = true;
  state.removeAttribute("role");
  main.setAttribute("aria-busy", "false");
  delete main.dataset.error;
  main.dataset.ready = "true";
}

function applyHostContext(context) {
  if (context.locale && !resultLocale) {
    activeLocale = resolveLocale(context.locale);
    applyLocale(activeLocale);
  }
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  if (context.safeAreaInsets) {
    for (const side of ["top", "right", "bottom", "left"]) {
      main.style.setProperty(
        `--safe-${side}`,
        `${context.safeAreaInsets[side]}px`,
      );
    }
  }
}

app.ontoolresult = render;
app.ontoolcancelled = (params) => {
  showTerminalState("cancelled", params.reason);
};
app.onhostcontextchanged = applyHostContext;
app.onerror = (error) => showTerminalState("error", error);
app.connect().then(() => {
  const context = app.getHostContext();
  if (context) applyHostContext(context);
}).catch((error) => showTerminalState("error", error));
