# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/alice51849/lumi-mcp/security/advisories/new).
Do not include vulnerability details in a public issue.

Include the affected version, reproducible steps, expected impact, and any
suggested mitigation. Reports are reviewed privately through the GitHub
security advisory until a coordinated fix or disclosure is ready.

## Supported versions

The latest tagged release is supported. Upgrade to the newest release before
reporting an issue that only affects an older version.

## Verify an OCI release

Use the immutable digest shown by GHCR or the GitHub release:

```bash
gh attestation verify \
  oci://ghcr.io/alice51849/lumi-app-finder@sha256:<digest> \
  --repo alice51849/lumi-mcp
gh attestation verify \
  oci://ghcr.io/alice51849/lumi-app-finder@sha256:<digest> \
  --repo alice51849/lumi-mcp \
  --predicate-type https://spdx.dev/Document/v2.3
```

The image must also expose
`io.modelcontextprotocol.server.name=io.github.alice51849/lumi-app-finder`.
