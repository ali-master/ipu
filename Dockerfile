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

FROM oven/bun:${BUN_VERSION}-alpine AS runtime-files
# Copy the musl loader and Bun's shared libraries without Alpine's shell or tools.
RUN mkdir -p /rootfs/usr/local/bin /rootfs/lib /rootfs/usr/lib /rootfs/etc/ssl/certs \
    && cp /usr/local/bin/bun /rootfs/usr/local/bin/bun \
    && cp -L /lib/ld-musl-*.so.1 /rootfs/lib/ \
    && cp -L /usr/lib/libstdc++.so.6 /usr/lib/libgcc_s.so.1 /rootfs/usr/lib/ \
    && cp /etc/ssl/certs/ca-certificates.crt /rootfs/etc/ssl/certs/

FROM scratch AS runtime
COPY --from=runtime-files /rootfs/ /
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
COPY --from=build --chown=65532:65532 /out/ ./
COPY --from=build --chown=65532:65532 /app/dist/ ./dist/
USER 65532:65532
RUN ["/usr/local/bin/bun", "--version"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/usr/local/bin/bun", "/app/index.js", "--healthcheck"]
ENTRYPOINT ["/usr/local/bin/bun", "/app/index.js"]
