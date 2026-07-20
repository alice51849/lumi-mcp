# Lumi App Finder MCP

Lumi App Finder gives AI assistants one read-only tool for matching a user's
task or buyer need to a verified live Lumi Studio iOS app.

It covers **28 apps × all 50 Apple locales**. Every result includes
editorially localized context, the purchase model, a detailed guide, and a
direct App Store link for the matching storefront.

Hosts that support the stable MCP Apps extension render the matches as
interactive, localized cards with one-click App Store and guide actions.
Other hosts receive the same complete text and structured-data fallback.

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
the official MCP Registry, or use a version-pinned installer:

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522lumi-app-finder%2522%252C%2522type%2522%253A%2522stdio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522https%253A%252F%252Fgithub.com%252Falice51849%252Flumi-mcp%252Freleases%252Fdownload%252Fv1.0.3%252Flumi-app-finder-npx.tgz%2522%255D%257D)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=lumi-app-finder&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImh0dHBzOi8vZ2l0aHViLmNvbS9hbGljZTUxODQ5L2x1bWktbWNwL3JlbGVhc2VzL2Rvd25sb2FkL3YxLjAuMy9sdW1pLWFwcC1maW5kZXItbnB4LnRneiJdfQ%3D%3D)
[![Download for Claude Desktop](https://img.shields.io/badge/Claude_Desktop-Download_MCPB-D97757)](https://github.com/alice51849/lumi-mcp/releases/latest/download/lumi-app-finder.mcpb)

The VS Code and Cursor links run the zero-dependency server from the pinned
public `v1.0.3` GitHub release through `npx`; Node.js 20 or newer is required.
The same pinned configuration can be added manually:

```json
{
  "servers": {
    "lumi-app-finder": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/alice51849/lumi-mcp/releases/download/v1.0.3/lumi-app-finder-npx.tgz"
      ]
    }
  }
}
```

The MCPB uses Node's stdio transport and needs no account, API key, external UI
runtime, or manual configuration.

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
npm run build:ui
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
[THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt); bundled MCP App library
licenses are in [MCP_APP_NOTICES.txt](./MCP_APP_NOTICES.txt).
