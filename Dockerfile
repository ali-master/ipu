# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --ignore-scripts

COPY tsconfig.json bunfig.toml ./
COPY src ./src
COPY scripts/build.ts ./scripts/build.ts
RUN bun check \
    && bun run build \
    && bun build src/index.ts --target=bun --minify --bytecode --outdir=/out

FROM oven/bun:${BUN_VERSION}-distroless AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=65532:65532 /out/ ./
COPY --from=build --chown=65532:65532 /app/dist/ ./dist/
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["bun", "/app/index.js", "--healthcheck"]
ENTRYPOINT ["bun", "/app/index.js"]
