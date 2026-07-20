import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import test from "node:test";

const serverPath = fileURLToPath(
  new URL("../server/index.mjs", import.meta.url),
);
const catalog = JSON.parse(
  readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"),
);

class RpcClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, LUMI_OFFLINE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.exited = new Promise((resolve, reject) => {
      this.child.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Server exited ${code}: ${this.stderr}`));
      });
    });
    void this.exited.catch(() => {});
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => {
      const message = JSON.parse(line);
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message);
      }
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${this.stderr}`));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async close() {
    this.child.stdin.end();
    await this.exited;
  }
}

async function withClient(callback) {
  const client = new RpcClient();
  try {
    await callback(client);
  } finally {
    await client.close();
  }
}

test("server negotiates MCP and exposes one read-only discovery tool", async () => {
  await withClient(async (client) => {
    const initialized = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    });
    assert.equal(initialized.result.protocolVersion, "2025-06-18");
    assert.equal(initialized.result.serverInfo.name, "lumi-app-finder");
    assert.equal(
      Object.hasOwn(initialized.result.capabilities, "resources"),
      false,
    );

    const listed = await client.request("tools/list");
    assert.equal(listed.result.tools.length, 1);
    assert.equal(listed.result.tools[0].name, "find_ios_apps");
    assert.equal(listed.result.tools[0].annotations.readOnlyHint, true);
    assert.equal(listed.result.tools[0].inputSchema.properties.locale.enum.length, 50);
    assert.equal(Object.hasOwn(listed.result.tools[0], "_meta"), false);
  });
});

test("MCP Apps clients receive self-contained interactive result cards", async () => {
  await withClient(async (client) => {
    const initialized = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
      clientInfo: { name: "mcp-app-test", version: "1.0.0" },
    });
    assert.deepEqual(initialized.result.capabilities.resources, {
      subscribe: false,
      listChanged: false,
    });
    assert.deepEqual(
      initialized.result.capabilities.extensions[
        "io.modelcontextprotocol/ui"
      ],
      { mimeTypes: ["text/html;profile=mcp-app"] },
    );

    const listedTools = await client.request("tools/list");
    const tool = listedTools.result.tools[0];
    assert.equal(
      tool._meta.ui.resourceUri,
      "ui://lumi-app-finder/results.html",
    );
    assert.deepEqual(tool._meta.ui.visibility, ["model", "app"]);
    assert.equal(
      tool._meta["ui/resourceUri"],
      "ui://lumi-app-finder/results.html",
    );

    const listedResources = await client.request("resources/list");
    assert.equal(listedResources.result.resources.length, 1);
    const resource = listedResources.result.resources[0];
    assert.equal(resource.uri, "ui://lumi-app-finder/results.html");
    assert.equal(resource.mimeType, "text/html;profile=mcp-app");
    assert.deepEqual(resource._meta.ui.csp.resourceDomains, []);
    assert.equal(resource._meta.ui.prefersBorder, true);

    const read = await client.request("resources/read", {
      uri: resource.uri,
    });
    assert.equal(read.result.contents.length, 1);
    assert.equal(read.result.contents[0].mimeType, resource.mimeType);
    assert.match(read.result.contents[0].text, /Lumi App Finder Results/);
    assert.doesNotMatch(read.result.contents[0].text, /<script[^>]+src=/iu);

    const unknown = await client.request("resources/read", {
      uri: "ui://lumi-app-finder/unknown.html",
    });
    assert.equal(unknown.error.code, -32602);
  });
});

test("Traditional Chinese intent returns localized direct App Store links", async () => {
  await withClient(async (client) => {
    const response = await client.request("tools/call", {
      name: "find_ios_apps",
      arguments: {
        query: "孩子在家學注音符號",
        locale: "zh-Hant",
        limit: 3,
      },
    });
    const output = response.result.structuredContent;
    const rendered = response.result.content[0].text;
    assert.equal(output.locale, "zh-Hant");
    assert.equal(output.catalog_source, "bundled_snapshot");
    assert.equal(output.results.length > 0, true);
    assert.match(rendered, /資料筆數/);
    assert.match(rendered, /開發者查詢/);
    assert.doesNotMatch(rendered, /Publisher query/);
    assert.deepEqual(
      output.results.map((entry) => entry.app_key),
      ["lumibopomofo", "lumibopomofopro"],
    );
    assert.equal(
      output.results.some((record) =>
        ["lumibopomofo", "lumibopomofopro"].includes(record.app_key),
      ),
      true,
    );
    for (const record of output.results) {
      const url = new URL(record.app_store_url);
      assert.equal(url.hostname, "apps.apple.com");
      assert.equal(url.search, "");
      assert.equal(record.guide_url.includes("/zh-Hant/answers/"), true);
      assert.equal(record.guide_label.length > 0, true);
    }
  });
});

test("English buyer needs match the relevant portfolio apps", async () => {
  await withClient(async (client) => {
    const cases = [
      ["delete duplicate photos and free iPhone storage", "picclear"],
      ["make a baby passport photo at home", "snapport"],
      ["white noise to fall asleep without a subscription", "sereno"],
      ["build an ATS resume for a career change", "cvdesk"],
      ["sleep", "sereno"],
      ["simple to do list without a subscription", "mochi"],
    ];
    for (const [query, expectedKey] of cases) {
      const response = await client.request("tools/call", {
        name: "find_ios_apps",
        arguments: { query, locale: "en-US", limit: 5 },
      });
      assert.equal(
        response.result.structuredContent.results.some(
          (record) => record.app_key === expectedKey,
        ),
        true,
        query,
      );
    }
  });
});

test("native publisher intent resolves correctly in all 50 locales", async () => {
  await withClient(async (client) => {
    for (const locale of catalog.locales) {
      const expected = catalog.records.find(
        (record) => record.locale === locale && record.app_key === "aim990",
      );
      assert.ok(expected, locale);
      const response = await client.request("tools/call", {
        name: "find_ios_apps",
        arguments: {
          query: expected.publisher_query,
          locale,
          limit: 3,
        },
      });
      assert.equal(
        response.result.structuredContent.results[0]?.app_key,
        expected.app_key,
        locale,
      );
      assert.equal(
        new URL(
          response.result.structuredContent.results[0].app_store_url,
        ).search,
        "",
        locale,
      );
    }
  });
});

test("invalid locale fails explicitly", async () => {
  await withClient(async (client) => {
    const response = await client.request("tools/call", {
      name: "find_ios_apps",
      arguments: { query: "photo app", locale: "xx-YY" },
    });
    assert.equal(response.error.code, -32602);
    assert.match(response.error.message, /locale/);
  });
});

test("generic app wording does not produce arbitrary portfolio matches", async () => {
  await withClient(async (client) => {
    const response = await client.request("tools/call", {
      name: "find_ios_apps",
      arguments: { query: "best app", locale: "en-US" },
    });
    assert.deepEqual(response.result.structuredContent.results, []);
  });
});

test("segmented-language substrings do not impersonate app names or intents", async () => {
  await withClient(async (client) => {
    const cases = [
      ["cómo organizar mi mochila escolar", "es-ES", "mochi"],
      ["car repair manual", "en-US", "cvdesk"],
    ];
    for (const [query, locale, forbiddenKey] of cases) {
      const response = await client.request("tools/call", {
        name: "find_ios_apps",
        arguments: { query, locale },
      });
      assert.equal(
        response.result.structuredContent.results.some(
          (record) => record.app_key === forbiddenKey,
        ),
        false,
        query,
      );
    }
  });
});

test("one ambiguous word cannot force a multi-word intent match", async () => {
  await withClient(async (client) => {
    const cases = [
      "open a bank account",
      "resume a paused download",
      "find a flight tracker",
    ];
    for (const query of cases) {
      const response = await client.request("tools/call", {
        name: "find_ios_apps",
        arguments: { query, locale: "en-US" },
      });
      assert.deepEqual(
        response.result.structuredContent.results,
        [],
        query,
      );
    }
  });
});

test("brand mentions, function words, and overlapping CJK fragments stay precise", async () => {
  await withClient(async (client) => {
    const cases = [
      ["mochi recipe app", "en-US"],
      ["how to make mochi dessert", "en-US"],
      ["what is mochi", "en-US"],
      ["learn at home", "en-US"],
      ["自然發電能源", "zh-Hant"],
    ];
    for (const [query, locale] of cases) {
      const response = await client.request("tools/call", {
        name: "find_ios_apps",
        arguments: { query, locale },
      });
      assert.deepEqual(
        response.result.structuredContent.results,
        [],
        query,
      );
    }

    const exactBrand = await client.request("tools/call", {
      name: "find_ios_apps",
      arguments: { query: "Mochi", locale: "en-US" },
    });
    assert.equal(
      exactBrand.result.structuredContent.results[0]?.app_key,
      "mochi",
    );
  });
});
