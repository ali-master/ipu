<p align="center">
  <img src="assets/logo.svg" alt="IPU logo" width="144" height="144" />
</p>
<h1 align="center">IPU — IP, meet you.</h1>
<p align="center"><a href="https://ipu.usestrict.dev">ipu.usestrict.dev</a></p>

**U means you.** Discover your IP address, network and approximate location in an instant.

## Run

Requires **Bun 1.4.4+**. `build:db` builds the IP databases from public sources into `assets/` (about 270 MB of downloads, cached); run it again whenever you want fresher data. See [database sources](assets/README.md).

```sh
bun install --frozen-lockfile
bun run build:db
bun run build
bun start
```

For configuration, see [.env.example](.env.example). Set `SITE_URL` to your public origin (for example, `https://ipu.usestrict.dev`); restart the server to update SEO and discovery links. Behind a reverse proxy, set `TRUSTED_PROXIES` to its actual IPs/CIDRs.

## Docker

Uses the same database files, mounted read-only.

```sh
docker compose up -d --build --wait
```

Set `PORT=3300` if port 3000 is already in use. `HOST` controls the host bind address; the container listens on port 3000.

For Vercel, see the [deployment guide](docs/vercel.md).

## API

```sh
curl ipu.usestrict.dev/ip
curl ipu.usestrict.dev/json
curl ipu.usestrict.dev/1.1.1.1/json
```

Also supports `/country`, `/network`, `/asn` and `/<ip>/<endpoint>`. IPv4 and IPv6 work; `/health` reports readiness. Location is approximate, and missing data stays `null`.

[API reference](https://ipu.usestrict.dev/docs) · [OpenAPI](https://ipu.usestrict.dev/openapi.json) · [Agent guide](https://ipu.usestrict.dev/llms.txt)

## Checks

```sh
bun check
bun fmt --check
bun test
```
