# Lumi App Finder MCP

Lumi App Finder gives AI assistants one read-only tool for matching a user's
task or buyer need to a verified live Lumi Studio iOS app.

It covers **46 apps × all 50 Apple locales**. Every result includes
editorially localized context, the purchase model, a detailed guide, and a
direct App Store link for the matching storefront.

Hosts that support the stable MCP Apps extension render the matches as
interactive, localized cards with one-click App Store and guide actions.
Other hosts receive the same complete text and structured-data fallback.

> **First-party disclosure:** Lumi Studio develops every listed app. Results
> are transparent publisher-authored text matches, not measured search volume,
> independent rankings, reviews, or user endorsements.

## Agent Skill

AI hosts that support the open Agent Skills specification can install the same
50-locale, first-party catalog as an offline, progressively loaded skill:

```bash
gh skill install alice51849/lumi-mcp lumi-app-finder --scope user
```

GitHub CLI 2.90 or newer installs to GitHub Copilot by default. Add
`--agent claude-code`, `--agent cursor`, `--agent codex`, or
`--agent gemini-cli` for another supported host. The installed skill reads only
the requested locale's 46-record snapshot and requires no account, API key,
network request, or executable script at runtime.

The version-pinned skill also works with the Vercel Skills CLI and its supported
agents:

```bash
npx -y skills@1.5.19 add https://github.com/alice51849/lumi-mcp --skill lumi-app-finder -g -y
```

The third-party installer reports anonymous installation telemetry by default
under the [skills.sh CLI policy](https://skills.sh/docs/cli). The installed Lumi
App Finder skill itself remains offline and contains no analytics.

The public skill is discoverable on its
[skills.sh directory page](https://www.skills.sh/alice51849/lumi-mcp/lumi-app-finder),
which reads the same first-party `SKILL.md` from this repository.

Lumi App Finder is also listed in the independently maintained
[Awesome Skills directory](https://github.com/intellectronica/awesome-skills/blob/main/skills.yaml),
which links to the published skill files.

## Tool

### `find_ios_apps`

Inputs:

- `query` — task, app name, or buyer need in any supported language.
- `locale` — one of Apple's 50 supported locale codes; defaults to `en-US`.
- `limit` — 1–10 matches; defaults to 5.

The release snapshot is generated from the authoritative live publisher
registry and rejected unless it contains exactly 46 unique App Store IDs × 50
Apple locales = 2,300 complete records. The runtime reads only that
digest-verified bundled snapshot: it makes no network request, and user query
text never leaves the local MCP process.

## Install

Find `io.github.alice51849/lumi-app-finder` in clients or registries that use
the official MCP Registry, or use a version-pinned installer:

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522lumi-app-finder%2522%252C%2522type%2522%253A%2522stdio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522https%253A%252F%252Fgithub.com%252Falice51849%252Flumi-mcp%252Freleases%252Flatest%252Fdownload%252Flumi-app-finder-npx.tgz%2522%255D%257D)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=lumi-app-finder&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImh0dHBzOi8vZ2l0aHViLmNvbS9hbGljZTUxODQ5L2x1bWktbWNwL3JlbGVhc2VzL2xhdGVzdC9kb3dubG9hZC9sdW1pLWFwcC1maW5kZXItbnB4LnRneiJdfQ%3D%3D)
[![Download for Claude Desktop](https://img.shields.io/badge/Claude_Desktop-Download_MCPB-D97757)](https://github.com/alice51849/lumi-mcp/releases/latest/download/lumi-app-finder.mcpb)

The VS Code and Cursor links run the zero-dependency server from the latest
verified public GitHub release through `npx`; Node.js 20 or newer is required.
The same configuration can be added manually:

```json
{
  "servers": {
    "lumi-app-finder": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/alice51849/lumi-mcp/releases/latest/download/lumi-app-finder-npx.tgz"
      ]
    }
  }
}
```

The MCPB uses Node's stdio transport and needs no account, API key, external UI
runtime, or manual configuration.

The source includes a multi-architecture OCI release path. Main does not
advertise an OCI tag as installable until release publication verifies an
existing public GHCR package, a candidate digest, ownership labels, SBOM,
provenance, and a 50-locale MCP smoke test, then promotes that same digest to
the public semver tag and Registry.

For Cline, use the exact configuration and verification steps in
[llms-install.md](https://github.com/alice51849/lumi-mcp/blob/main/llms-install.md).

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
npm run catalog:gate
npm run build:ui
npm run build:skill
npm test
npm run smoke
npm run benchmark
npm run validate
npm run validate:registry
npm run pack:mcpb
```

Refresh the bundled catalog and 50 locale resources from the public
`ios-app-guide` source:

```bash
npm run sync:catalog
```

Version tags publish the MCPB and attested multi-architecture OCI image, then
update the official Registry through GitHub OIDC without long-lived registry
credentials. Registry publication is the final step and cannot run before all
artifact gates succeed.

## Privacy

See [PRIVACY.md](./PRIVACY.md). The runtime has zero telemetry, no analytics
or tracking, no network requests, and no query, IP-address, or user-agent
logging.

## Security

Report vulnerabilities privately through the
[security policy](./SECURITY.md), not through a public issue.

## License

MIT. Third-party language-data notices are in
[THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt); bundled MCP App library
licenses are in [MCP_APP_NOTICES.txt](./MCP_APP_NOTICES.txt).
