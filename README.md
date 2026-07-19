# Lumi App Finder MCP

Lumi App Finder gives AI assistants one read-only tool for matching a user's
task or buyer need to a verified live Lumi Studio iOS app.

It covers **28 apps × all 50 Apple locales**. Every result includes
editorially localized context, the purchase model, a detailed guide, and a
direct App Store link for the matching storefront.

> **First-party disclosure:** Lumi Studio develops every listed app. Results
> are transparent publisher-authored text matches, not measured search volume,
> independent rankings, reviews, or user endorsements.

## Tool

### `find_ios_apps`

Inputs:

- `query` — task, app name, or buyer need in any supported language.
- `locale` — one of Apple's 50 supported locale codes; defaults to `en-US`.
- `limit` — 1–10 matches; defaults to 5.

The server reads the current public catalog when online and falls back to the
bundled 1,400-record snapshot. User query text never leaves the local MCP
process.

## Install

Find `io.github.alice51849/lumi-app-finder` in clients or registries that use
the official MCP Registry, or install the `lumi-app-finder.mcpb` asset from the
[latest GitHub release](https://github.com/alice51849/lumi-mcp/releases/latest).

The MCPB uses Node's stdio transport and needs no account, API key, or manual
configuration.

## 50-locale coverage

`ar-SA`, `bn-BD`, `ca`, `cs`, `da`, `de-DE`, `el`, `en-AU`, `en-CA`,
`en-GB`, `en-US`, `es-ES`, `es-MX`, `fi`, `fr-CA`, `fr-FR`, `gu-IN`, `he`,
`hi`, `hr`, `hu`, `id`, `it`, `ja`, `kn-IN`, `ko`, `ml-IN`, `mr-IN`, `ms`,
`nl-NL`, `no`, `or-IN`, `pa-IN`, `pl`, `pt-BR`, `pt-PT`, `ro`, `ru`, `sk`,
`sl-SI`, `sv`, `ta-IN`, `te-IN`, `th`, `tr`, `uk`, `ur-PK`, `vi`,
`zh-Hans`, `zh-Hant`.

MCPB display metadata and the catalog output both use these localized
resources.

## Development

```bash
npm ci
npm test
npm run validate
npm run pack:mcpb
```

Refresh the bundled catalog and 50 locale resources from the public
`ios-app-guide` source:

```bash
npm run sync:catalog
```

Version tags publish the bundle as a GitHub release and register it through
GitHub OIDC, without long-lived registry credentials.

## Privacy

See [PRIVACY.md](./PRIVACY.md). The tool has no analytics or tracking, and
never sends user queries to the catalog host.

## License

MIT. Third-party language-data notices are in
[THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt).
