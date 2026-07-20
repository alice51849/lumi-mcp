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

test("MCPB metadata and resources expose every official locale", async () => {
  const [catalog, manifest, server, resourceFiles] = await Promise.all([
    json("server/catalog.json"),
    json("manifest.json"),
    json("server.json"),
    readdir(new URL("mcpb-resources/", root)),
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
});
