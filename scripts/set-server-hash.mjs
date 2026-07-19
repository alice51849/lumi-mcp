#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [bundleArg, serverArg, expectedVersion] = process.argv.slice(2);
if (!bundleArg || !serverArg) {
  throw new Error(
    "Usage: set-server-hash.mjs <bundle.mcpb> <server.json> [version]",
  );
}

const bundlePath = path.resolve(bundleArg);
const serverPath = path.resolve(serverArg);
const [bundle, rawServer, rawManifest, rawPackage] = await Promise.all([
  readFile(bundlePath),
  readFile(serverPath, "utf8"),
  readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const server = JSON.parse(rawServer);
const manifest = JSON.parse(rawManifest);
const packageJson = JSON.parse(rawPackage);
const versions = new Set([
  server.version,
  manifest.version,
  packageJson.version,
]);
if (versions.size !== 1) {
  throw new Error("package.json, manifest.json, and server.json differ.");
}
const version = server.version;
if (expectedVersion && version !== expectedVersion) {
  throw new Error(
    `Release tag version '${expectedVersion}' does not match '${version}'.`,
  );
}
const packageEntry = server.packages?.find(
  (entry) => entry.registryType === "mcpb",
);
if (!packageEntry) throw new Error("server.json has no MCPB package.");
const expectedUrl =
  `https://github.com/alice51849/lumi-mcp/releases/download/v${version}/` +
  "lumi-app-finder.mcpb";
if (packageEntry.identifier !== expectedUrl) {
  throw new Error("server.json release URL does not match its version.");
}
packageEntry.fileSha256 = createHash("sha256").update(bundle).digest("hex");
await writeFile(serverPath, `${JSON.stringify(server, null, 2)}\n`, "utf8");
console.log(packageEntry.fileSha256);
