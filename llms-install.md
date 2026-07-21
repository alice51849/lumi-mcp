# Install Lumi App Finder in Cline

Use this guide to add the stable Lumi App Finder `v1.1.2` stdio server to
Cline. It requires Node.js 20 or newer. It needs no account, API key, secret,
or environment variable.

## Configure

For Cline CLI, use its native non-interactive installer:

```bash
cline mcp install lumi-app-finder --yes -- npx -y https://github.com/alice51849/lumi-mcp/releases/download/v1.1.2/lumi-app-finder-npx.tgz
```

For the Cline IDE extension, merge the following entry into the existing
`mcpServers` object in Cline's MCP settings. Do not replace unrelated server
entries.

```json
{
  "mcpServers": {
    "lumi-app-finder": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/alice51849/lumi-mcp/releases/download/v1.1.2/lumi-app-finder-npx.tgz"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

In the IDE extension, open **MCP Servers**, choose **Configure**, and select
**Configure MCP Servers**.

Keep `autoApprove` empty so the user reviews each App Store lookup before it
runs. Cline should start the package with stdio transport automatically.

## Verify

1. Confirm that Cline lists the `find_ios_apps` tool under
   `lumi-app-finder`.
2. Ask Cline to call `find_ios_apps` with:

   ```json
   {
     "query": "block social media while studying",
     "locale": "en-US",
     "limit": 3
   }
   ```

3. Confirm that the result identifies itself as first-party publisher content
   and includes direct `apps.apple.com` links.

The server reads the current public catalog when available and falls back to
its bundled 1,400-record snapshot. User query text stays inside the local MCP
process.

## Troubleshoot

- If Cline cannot start the server, verify that `node --version` is 20 or
  newer and that `npx --version` succeeds.
- If the first launch cannot download the package, retry after restoring
  access to GitHub Releases. Subsequent matching can use the bundled catalog.
- If tools do not appear after editing the settings file, restart this server
  from Cline's MCP Servers panel.
