import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function json(relative) {
  return JSON.parse(await readFile(new URL(relative, root), "utf8"));
}

test("snapshot covers 28 apps across all 50 Apple locales", async () => {
  const catalog = await json("server/catalog.json");
  assert.equal(catalog.app_count, 28);
  assert.equal(catalog.locale_count, 50);
  assert.equal(catalog.record_count, 1400);
  assert.equal(catalog.records.length, 1400);
  assert.deepEqual(Object.keys(catalog.stopwords), catalog.locales);
  assert.equal(new Set(catalog.records.map((record) => record.app_key)).size, 28);
  assert.equal(
    new Set(
      catalog.records.map(
        (record) => `${record.app_key}\u0000${record.locale}`,
      ),
    ).size,
    1400,
  );
  for (const record of catalog.records) {
    assert.equal(record.purchase_label.length > 0, true);
    const store = new URL(record.app_store_url);
    assert.equal(store.hostname, "apps.apple.com");
    assert.equal(
      store.pathname.endsWith(`/id${record.app_store_id}`),
      true,
    );
    assert.equal(store.search, "");
    assert.equal(store.hash, "");
  }
  for (const locale of catalog.locales) {
    assert.equal(catalog.stopwords[locale].length > 0, true);
    assert.equal(
      new Set(catalog.stopwords[locale]).size,
      catalog.stopwords[locale].length,
    );
    assert.equal(catalog.ui[locale].description.length > 0, true);
    assert.equal(catalog.ui[locale].locale_label.length > 0, true);
    assert.equal(catalog.ui[locale].records_label.length > 0, true);
    assert.equal(catalog.ui[locale].publisher_query_label.length > 0, true);
    assert.equal(catalog.ui[locale].decision_context_label.length > 0, true);
    assert.equal(catalog.ui[locale].purchase_model_label.length > 0, true);
    assert.equal(catalog.ui[locale].guide_label.length > 0, true);
  }
});

test("Agent Skill ships an offline 28-app catalog for every locale", async () => {
  const [catalog, packageJson, skill, locales, referenceFiles, readme] =
    await Promise.all([
      json("server/catalog.json"),
      json("package.json"),
      readFile(new URL("skills/lumi-app-finder/SKILL.md", root), "utf8"),
      readFile(
        new URL("skills/lumi-app-finder/references/LOCALES.md", root),
        "utf8",
      ),
      readdir(new URL("skills/lumi-app-finder/references/", root)),
      readFile(new URL("README.md", root), "utf8"),
    ]);
  assert.match(skill, /^---\nname: lumi-app-finder\n/mu);
  assert.match(skill, /all 50 Apple locales/u);
  assert.match(skill, /not an independent ranking/u);
  assert.match(skill, new RegExp(`version: "${packageJson.version}"`, "u"));
  assert.doesNotMatch(skill, /^allowed-tools:/mu);
  assert.equal(
    readme.includes(
      `gh skill install alice51849/lumi-mcp lumi-app-finder@v${packageJson.version} --scope user`,
    ),
    true,
  );
  assert.equal(
    readme.includes(
      `npx -y skills@1.5.19 add https://github.com/alice51849/lumi-mcp/tree/v${packageJson.version}/skills/lumi-app-finder --skill lumi-app-finder -g -y`,
    ),
    true,
  );
  assert.match(readme, /anonymous installation telemetry/u);

  const jsonFiles = referenceFiles
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual(
    jsonFiles,
    catalog.locales.map((locale) => `${locale}.json`).sort(),
  );
  for (const locale of catalog.locales) {
    assert.match(locales, new RegExp(`\\| \`${locale}\` \\|`, "u"));
    const reference = await json(
      `skills/lumi-app-finder/references/${locale}.json`,
    );
    const source = catalog.records
      .filter((record) => record.locale === locale)
      .sort((left, right) => left.app_key.localeCompare(right.app_key));
    assert.equal(reference.locale, locale);
    assert.equal(reference.app_count, 28);
    assert.equal(reference.apps.length, 28);
    assert.equal(reference.publisher_disclosure, catalog.ui[locale].disclosure);
    assert.equal(
      reference.non_ranking_disclosure,
      catalog.ui[locale].non_measured,
    );
    assert.equal(reference.measured_search_volume, false);
    assert.equal(reference.is_ranking, false);
    assert.deepEqual(
      reference.apps.map((app) => app.app_key),
      source.map((record) => record.app_key),
    );
    for (const [index, app] of reference.apps.entries()) {
      const record = source[index];
      assert.equal(app.app_name, record.app_name);
      assert.equal(app.publisher_query, record.publisher_query);
      assert.equal(app.source_persona_query, record.source_persona_query);
      assert.equal(app.decision_context, record.decision_context);
      assert.equal(app.purchase_model, record.purchase_model);
      assert.equal(app.purchase_label, record.purchase_label);
      assert.equal(app.verified_live, true);
      assert.equal(app.guide_url, record.canonical_guide_url);
      assert.equal(app.app_store_url, record.app_store_url);
      assert.equal(app.app_store_cta_label, record.app_store_cta_label);
      assert.equal(/[\r\n\u2028\u2029]/u.test(JSON.stringify(app)), false);
    }
  }
});

test("MCPB metadata and resources expose every official locale", async () => {
  const [
    catalog,
    manifest,
    server,
    resourceFiles,
    appHtml,
    appNotices,
    statusMessages,
  ] = await Promise.all([
    json("server/catalog.json"),
    json("manifest.json"),
    json("server.json"),
    readdir(new URL("mcpb-resources/", root)),
    readFile(new URL("ui/app-finder.html", root), "utf8"),
    readFile(new URL("MCP_APP_NOTICES.txt", root), "utf8"),
    json("ui/status-messages.json"),
  ]);
  assert.equal(manifest.manifest_version, "0.3");
  assert.equal(manifest.version, server.version);
  assert.equal(manifest.tools.length, 1);
  assert.equal(manifest.tools[0].name, "find_ios_apps");
  assert.deepEqual(
    resourceFiles.filter((file) => file.endsWith(".json")).sort(),
    catalog.locales.map((locale) => `${locale}.json`).sort(),
  );
  for (const locale of catalog.locales) {
    const resource = await json(`mcpb-resources/${locale}.json`);
    assert.equal(resource.display_name.length > 0, true);
    assert.equal(resource.description.length > 0, true);
    assert.equal(resource.long_description.length > resource.description.length, true);
    assert.equal(resource.tools[0].name, "find_ios_apps");
    assert.equal(resource.tools[0].description.length > 0, true);
  }
  const mcpb = server.packages.find(
    (entry) => entry.registryType === "mcpb",
  );
  assert.equal(Object.hasOwn(mcpb, "registryBaseUrl"), false);
  assert.match(mcpb.fileSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    mcpb.identifier,
    "https://github.com/alice51849/lumi-mcp/releases/download/" +
      `v${server.version}/lumi-app-finder.mcpb`,
  );
  assert.equal(Buffer.byteLength(appHtml, "utf8") < 1_000_000, true);
  assert.match(appHtml, /<title>Lumi App Finder Results<\/title>/);
  assert.doesNotMatch(appHtml, /<script[^>]+src=/iu);
  assert.doesNotMatch(appHtml, /https:\/\/unpkg\.com/iu);
  assert.deepEqual(Object.keys(statusMessages), catalog.locales);
  for (const messages of Object.values(statusMessages)) {
    assert.equal(messages.error.length > 0, true);
    assert.equal(messages.cancelled.length > 0, true);
    assert.equal(/[\r\n]/u.test(messages.error + messages.cancelled), false);
  }
  for (const dependency of [
    "@modelcontextprotocol/ext-apps",
    "@modelcontextprotocol/sdk",
    "zod",
    "zod-to-json-schema",
  ]) {
    assert.match(appNotices, new RegExp(`^${dependency}$`, "mu"));
  }
});

test("host installers stay version-pinned to the zero-dependency launcher", async () => {
  const [packageJson, packageLock, manifest, server, readme, serverSource] =
    await Promise.all([
      json("package.json"),
      json("package-lock.json"),
      json("manifest.json"),
      json("server.json"),
      readFile(new URL("README.md", root), "utf8"),
      readFile(new URL("server/index.mjs", root), "utf8"),
    ]);
  const version = packageJson.version;
  const source =
    "https://github.com/alice51849/lumi-mcp/releases/download/" +
    `v${version}/lumi-app-finder-npx.tgz`;
  const vscodeConfig = {
    name: "lumi-app-finder",
    type: "stdio",
    command: "npx",
    args: ["-y", source],
  };
  const vscodeUri =
    `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeConfig))}`;
  const vscodeUrl =
    `https://vscode.dev/redirect?url=${encodeURIComponent(vscodeUri)}`;
  const cursorConfig = {
    command: "npx",
    args: ["-y", source],
  };
  const cursorUrl =
    "https://cursor.com/en/install-mcp" +
    "?name=lumi-app-finder&config=" +
    encodeURIComponent(
      Buffer.from(JSON.stringify(cursorConfig)).toString("base64"),
    );

  assert.equal(packageJson.private, true);
  assert.deepEqual(packageJson.bin, {
    "lumi-app-finder": "server/index.mjs",
  });
  assert.deepEqual(packageLock.packages[""].bin, packageJson.bin);
  assert.equal(packageLock.version, version);
  assert.equal(packageLock.packages[""].version, version);
  assert.equal(manifest.version, version);
  assert.equal(server.version, version);
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
    assert.equal(Object.hasOwn(packageJson.scripts, lifecycle), false);
  }
  assert.equal(serverSource.startsWith("#!/usr/bin/env node\n"), true);
  const imports = [
    ...serverSource.matchAll(/^import .* from ["']([^"']+)["'];$/gmu),
  ].map((match) => match[1]);
  assert.equal(imports.length > 0, true);
  assert.equal(imports.every((specifier) => specifier.startsWith("node:")), true);
  assert.equal(readme.includes(`](${vscodeUrl})`), true);
  assert.equal(readme.includes(`](${cursorUrl})`), true);
  assert.equal(readme.includes(`"${source}"`), true);
});
