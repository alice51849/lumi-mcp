FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/alice51849/lumi-mcp" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY --chown=node:node server/ ./server/
COPY --chown=node:node ui/ ./ui/
COPY --chown=node:node LICENSE MCP_APP_NOTICES.txt THIRD_PARTY_NOTICES.txt ./

USER node

ENTRYPOINT ["node", "server/index.mjs"]
