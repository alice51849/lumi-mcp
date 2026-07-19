# Privacy

Lumi App Finder is a read-only, first-party catalog tool.

- It does not require an account, API key, or payment.
- It does not collect, store, sell, or transmit the user's search text.
- It does not include analytics, advertising SDKs, tracking pixels, or telemetry.
- It fetches the public Lumi Studio app catalog from
  `alice51849.github.io` and falls back to the bundled snapshot if unavailable.
  The catalog request does not contain the user's query.
- App Store links include a non-personal `ct` route label. No user identifier
  or search text is encoded in the label.

Opening an App Store or guide link is governed by the destination's own privacy
policy and server logs. Apple explains its privacy practices at
<https://www.apple.com/legal/privacy/>.

Questions may be filed at
<https://github.com/alice51849/lumi-mcp/issues>.
