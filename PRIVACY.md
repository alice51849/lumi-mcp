# Privacy

Lumi App Finder is a read-only, offline, first-party catalog tool with zero
telemetry.

- It does not require an account, API key, or payment.
- It does not collect, store, sell, or transmit the user's search text.
- It does not log the query, IP address, user-agent, or MCP client identity.
- It does not include analytics, advertising SDKs, tracking pixels, or telemetry.
- It makes no runtime network requests. A digest-verified snapshot is generated
  from the public Lumi Studio live registry before release and bundled into the
  server; invalid or incomplete coverage fails closed during CI.
- App Store links always contain Apple's complete `pt` + `ct=lumi_oci` +
  `mt=8` campaign tuple. They contain no query, user identifier, locale token,
  IP address, or user-agent. Market analysis uses the territory Apple reports
  in App Store Connect, not a per-locale campaign token.
- The bundled interactive UI loads no external scripts, images, fonts, or
  analytics. It asks the MCP host to open a destination only after a user
  activates the corresponding App Store or guide button.
- The OCI image is designed to run with `--network none`, a read-only
  filesystem, dropped capabilities, and a non-root user.

Opening an App Store or guide link is governed by the destination's own privacy
policy and server logs. Apple explains its privacy practices at
<https://www.apple.com/legal/privacy/>.

The optional third-party Skills CLI mentioned in the README is not part of Lumi
App Finder and may report anonymous installer telemetry under its own policy.
The installed skill, MCPB, npx package, and OCI runtime remain offline.

Questions may be filed at
<https://github.com/alice51849/lumi-mcp/issues>.
