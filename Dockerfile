FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e

ARG VERSION=0.0.0-dev
ARG REVISION=unknown
ARG CREATED=1970-01-01T00:00:00Z

LABEL org.opencontainers.image.title="Lumi App Finder" \
      org.opencontainers.image.description="Private offline MCP discovery for verified live Lumi Studio iOS apps across 50 Apple locales" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.source="https://github.com/alice51849/lumi-mcp" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="io.github.alice51849/lumi-app-finder"

WORKDIR /app

COPY --chown=65532:65532 server/index.mjs server/catalog-contract.mjs server/catalog.json ./server/
COPY --chown=65532:65532 ui/app-finder.html ./ui/
COPY --chown=65532:65532 LICENSE MCP_APP_NOTICES.txt PRIVACY.md THIRD_PARTY_NOTICES.txt ./

USER 65532:65532

ENTRYPOINT ["/nodejs/bin/node"]
CMD ["server/index.mjs"]
