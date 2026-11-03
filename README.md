# IPU — IP, meet you.

**U means you.** IPU automatically shows the visitor's IP address, matching network, ASN, approximate location, timezone and address traits. Browsers get a responsive interface; terminals get plain text. No external lookup service is called.

Built with **Bun**, **Elysia**, **React**, **shadcn/ui**, **Tailwind CSS 4**, **MaxMind** and a lazy-loaded **COBE** globe. Work Sans is self-hosted. Light/dark mode follows the system until the visitor chooses a preference.

## Run

```sh
bun install --frozen-lockfile
bun run build
bun start
# http://localhost:3000
```

`bun run dev` builds the frontend and watches the server. Run it again after frontend edits to rebuild the browser assets. `bun run build` uses Bun's native bundler and Tailwind plugin; no Vite or Node server is required.

On localhost the visitor IP is normally `127.0.0.1` or `::1`, so public location and ASN are unavailable. Use [the supplied example IP](http://localhost:3000/88.198.53.22) to explore a real database record. On a public deployment, IPU reads the visitor's socket address automatically.

## Databases

Place these files in `assets/` (large MMDB files are ignored by Git):

- `GeoLite2-City-2026-06-05.mmdb` — required; the database supplied with this project.
- `GeoLite2-ASN.mmdb` — adds ASN number and organization. City databases do not contain ASN data. Without this file, ASN fields are explicitly `null`.

Database provenance, build dates, download sources and checksums are in [assets/README.md](assets/README.md). Obtain replacement databases from [MaxMind](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/) and restart the service after replacing them. Database files are loaded once at startup; there are no recurring downloads.

The `network` field is the matching City database CIDR, falling back to the ASN database CIDR if there is no City record. `network_source` states which database supplied it. It is **not** a live BGP route. Coordinates are approximate; `accuracy_radius` is in kilometers. Missing fields remain `null`, and local/reserved addresses are never assigned a fabricated location.

## HTTP API

| Endpoint   | Result                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| `/`        | Browser UI for `Accept: text/html`; otherwise a full plain-text summary |
| `/ip`      | Caller IP only                                                          |
| `/json`    | Full JSON, with timing/cache metadata                                   |
| `/country` | Country name                                                            |
| `/network` | Matching network CIDR                                                   |
| `/asn`     | ASN number                                                              |
| `/<ip>`    | Look up an IPv4 or IPv6 address; HTML, JSON or text by `Accept`         |
| `/health`  | Readiness after databases and assets load                               |

Focused endpoints also accept `?ip=<address>`. Plain-text endpoints print `Unavailable` for a missing value. Invalid query IPs return HTTP 400; unknown paths return 404; unresolved client addresses return 503. Only GET and HEAD are supported.

```sh
curl localhost:3000
curl localhost:3000/ip
curl localhost:3000/json
curl localhost:3000/88.198.53.22
curl 'localhost:3000/json?ip=2606:4700:4700::1111'
curl -H 'Accept: application/json' localhost:3000/1.1.1.1
wget -qO- localhost:3000/country
http localhost:3000/json
```

JSON fields: `ip`, `network`, `network_source`, `continent`, `country`, `country_code`, `region`, `city`, `timezone`, `latitude`, `longitude`, `accuracy_radius`, `asn`, `asn_organization`, `private_address`, `ipv6`, `address_type`, `database`, and `meta` (`cached`, `lookup_ms`). IPv4-mapped IPv6 is normalized to IPv4. `private_address` includes private/unique-local, loopback and link-local addresses; other reserved ranges have their own `address_type`.

## Configuration and reverse proxies

Copy `.env.example` to `.env` if needed; Bun loads it automatically. `HOST` defaults to `0.0.0.0`, `PORT` to `3000`. `MAXMIND_CITY_DB` and `MAXMIND_ASN_DB` override database paths.

Forwarding headers are ignored by default. If a reverse proxy sits in front of IPU, set `TRUSTED_PROXIES` to the actual proxy IPs/CIDRs. For a proxy on the same machine:

```dotenv
TRUSTED_PROXIES=127.0.0.1/32,::1/128
```

The proxy must overwrite or append `X-Forwarded-For`, and direct origin access should follow your deployment's intended boundary. IPU walks the chain from right to left and stops at the first untrusted hop; it does not trust arbitrary `CF-Connecting-IP` or `X-Real-IP` headers. Never put every public network into the trust list.

