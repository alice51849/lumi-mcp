#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const source = fileURLToPath(new URL("ui/app-finder.mjs", root));
const templatePath = fileURLToPath(
  new URL("ui/app-finder.template.html", root),
);
const outputPath = fileURLToPath(new URL("ui/app-finder.html", root));
const noticesPath = fileURLToPath(new URL("MCP_APP_NOTICES.txt", root));
const marker = "/*__LUMI_APP_BUNDLE__*/";
const bundledPackages = [
  ["@modelcontextprotocol/ext-apps", "node_modules/@modelcontextprotocol/ext-apps/LICENSE"],
  ["@modelcontextprotocol/sdk", "node_modules/@modelcontextprotocol/sdk/LICENSE"],
  ["zod", "node_modules/zod/LICENSE"],
  ["zod-to-json-schema", "node_modules/zod-to-json-schema/LICENSE"],
];

async function generatedHtml() {
  const [template, bundled] = await Promise.all([
    readFile(templatePath, "utf8"),
    build({
      entryPoints: [source],
      bundle: true,
      charset: "utf8",
      format: "iife",
      legalComments: "none",
      minify: true,
      platform: "browser",
      target: ["es2022"],
      write: false,
    }),
  ]);
  if (template.split(marker).length !== 2) {
    throw new Error("MCP App template must contain exactly one bundle marker.");
  }
  const script = bundled.outputFiles[0]?.text.replaceAll(
    "</script",
    "<\\/script",
  );
  if (!script) throw new Error("MCP App JavaScript bundle was not generated.");
  return template.replace(marker, script);
}

async function generatedNotices() {
  const licenses = await Promise.all(
    bundledPackages.map(async ([name, relative]) => {
      const license = (await readFile(new URL(relative, root), "utf8")).trim();
      return [
        "###############################################################################",
        name,
        "###############################################################################",
        "",
        license,
      ].join("\n");
    }),
  );
  return [
    "Licenses for libraries bundled into ui/app-finder.html",
    "",
    ...licenses,
    "",
  ].join("\n\n");
}

const [html, notices] = await Promise.all([
  generatedHtml(),
  generatedNotices(),
]);
if (process.argv.includes("--check")) {
  const [existingHtml, existingNotices] = await Promise.all([
    readFile(outputPath, "utf8").catch(() => ""),
    readFile(noticesPath, "utf8").catch(() => ""),
  ]);
  if (existingHtml !== html) {
    throw new Error("ui/app-finder.html is stale; run npm run build:ui.");
  }
  if (existingNotices !== notices) {
    throw new Error("MCP_APP_NOTICES.txt is stale; run npm run build:ui.");
  }
  console.log("MCP App UI bundle is current.");
} else {
  await Promise.all([
    writeFile(outputPath, html, "utf8"),
    writeFile(noticesPath, notices, "utf8"),
  ]);
  console.log(`Built ui/app-finder.html (${Buffer.byteLength(html)} bytes).`);
}
