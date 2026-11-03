<p align="center">
  <img src="assets/logo.svg" alt="IPU logo" width="144" height="144" />
</p>
<h1 align="center">IPU — IP, meet you.</h1>
<p align="center"><a href="https://ipu.usestrict.dev">ipu.usestrict.dev</a></p>

**U means you.** Fast IP, location, network and ASN lookup. Local MaxMind data, in-memory caching, light/dark themes and a simple HTTP API.

Built with Bun, React, shadcn/ui and Tailwind CSS.

## Run

Requires **Bun 1.4.4+**. Place `GeoLite2-City-2026-06-05.mmdb` in `assets/`; add `GeoLite2-ASN.mmdb` for ASN details. See [database sources](assets/README.md).

```sh
bun install --frozen-lockfile
bun run build
bun start
```

For configuration, see [.env.example](.env.example). Behind a reverse proxy, set `TRUSTED_PROXIES` to its actual IPs/CIDRs.

## Docker

Uses the same database files, mounted read-only.

```sh
docker compose up -d --build --wait
```

Set `IPU_PORT=3300` if port 3000 is already in use.

## API

```sh
curl ipu.usestrict.dev/ip
curl ipu.usestrict.dev/json
curl ipu.usestrict.dev/1.1.1.1/json
```

Also supports `/country`, `/network`, `/asn` and `/<ip>/<endpoint>`. IPv4 and IPv6 work; `/health` reports readiness. Location is approximate, and missing data stays `null`.

## Checks

```sh
bun check
bun fmt --check
bun test
```
