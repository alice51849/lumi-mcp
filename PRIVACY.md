# Privacy

Lumi App Finder is a read-only, first-party catalog tool.

- It does not require an account, API key, or payment.
- It does not collect, store, sell, or transmit the user's search text.
- It does not include analytics, advertising SDKs, tracking pixels, or telemetry.
- It fetches the public Lumi Studio app catalog from
  `alice51849.github.io` and falls back to the bundled snapshot if unavailable.
  The catalog request does not contain the user's query.
- App Store links are clean direct links unless the verified source supplies a
  complete Apple `pt` + `ct` + `mt=8` attribution route. No user identifier or
  search text is encoded in a link.
- The bundled interactive UI loads no external scripts, images, fonts, or
  analytics. It asks the MCP host to open a destination only after a user
  activates the corresponding App Store or guide button.

Opening an App Store or guide link is governed by the destination's own privacy
policy and server logs. Apple explains its privacy practices at
<https://www.apple.com/legal/privacy/>.

Questions may be filed at
<https://github.com/alice51849/lumi-mcp/issues>.
