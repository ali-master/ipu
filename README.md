# IPU — IP, meet you.

**U means you.** IPU automatically shows the visitor's IP address, matching network, ASN, approximate location, timezone and address traits. Browsers get a responsive interface; terminals get plain text. No external lookup service is called.

Built with **Bun**, **Elysia**, **React**, **shadcn/ui**, **Tailwind CSS 4**, **MaxMind** and a lazy-loaded **COBE** globe. Work Sans is self-hosted. Light/dark mode follows the system until the visitor chooses a preference.

## Run

Requires Bun 1.4.4 or newer.

```sh
bun install --frozen-lockfile
bun run build
bun start
# http://ipu.usestrict.dev
```

`bun run dev` builds the frontend and watches the server. Run it again after frontend edits to rebuild the browser assets. `bun run build` uses Bun's native bundler and Tailwind plugin; no Vite or Node server is required.

On localhost the visitor IP is normally `127.0.0.1` or `::1`, so public location and ASN are unavailable. Use [the supplied example IP](http://ipu.usestrict.dev/88.198.53.22) to explore a real database record. On a public deployment, IPU reads the visitor's socket address automatically.

## Docker

Keep the MaxMind files in `assets/`, then run:

```sh
docker compose up -d --build --wait
curl ipu.usestrict.dev/1.1.1.1/json
docker compose logs -f ipu
docker compose down
```

If port 3000 is already used by the development server, use `IPU_PORT=3300 docker compose up -d --build --wait` and open port 3300. `IPU_BIND_ADDRESS` defaults to `0.0.0.0`; set it to `127.0.0.1` for local-only access. `IPU_DATABASE_DIR` changes the host database directory. Database paths in `MAXMIND_CITY_DB` and `MAXMIND_ASN_DB` must refer to their container location under `/app/assets` (or the equivalent relative `assets/` path).

The multi-stage Dockerfile bundles the server and its dependencies with minification and cached bytecode. The final `scratch` image copies Bun, its musl loader, C++ runtime libraries and CA certificates from the official version-pinned Bun Alpine image. It contains no shell, Alpine package manager, `node_modules`, build tools or MMDB files. A build-time runtime check catches missing shared libraries. Dependency installation and downloads are cached separately from source edits, and `.dockerignore` limits the build context to application inputs.

On Linux ARM64, the runtime change reduced uncompressed image layers from approximately 131 MiB to 101 MiB, and gzip-compressed layers from 58 MiB to 50 MiB. Docker Desktop reported 191 MiB versus 151 MiB of local image storage; its containerd store retains both compressed and extracted layers, so this is not download size. These measurements exclude the separately mounted databases and vary with architecture and Bun version. UPX was also tested: it reduced uncompressed layers to 50 MiB, but approximately doubled idle memory and increased local startup from 110 ms to 400 ms, so it is not used. Bun's JIT remains enabled.

Compose runs as UID/GID 65532, uses a read-only filesystem and database mount, drops Linux capabilities and checks `/health` using Bun itself. The existing process-local lookup cache and precompressed asset serving remain active. There are no installs, builds or database downloads at container startup. To update databases, replace the host files and run `docker compose restart ipu`.

Forwarded IP headers still require explicit `TRUSTED_PROXIES`. Docker Desktop may present a gateway IP for direct local requests; use an explicit IP endpoint to inspect public data locally. Configure only your actual reverse proxy addresses in production.

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

Every lookup endpoint also supports an IP prefix: `/<ip>/json`, `/<ip>/ip`, `/<ip>/country`, `/<ip>/network`, and `/<ip>/asn`. IPv4 and IPv6 are accepted, including percent-encoded IPv6. The path IP takes precedence over `?ip=`. Invalid IPs on these endpoint paths return 400; unknown suffixes return 404. `/health` remains a service readiness endpoint.

```sh
curl ipu.usestrict.dev
curl ipu.usestrict.dev/ip
curl ipu.usestrict.dev/json
curl ipu.usestrict.dev/88.198.53.22
curl ipu.usestrict.dev/1.1.1.1/json
curl ipu.usestrict.dev/88.198.53.22/network
curl 'ipu.usestrict.dev/2606:4700:4700::1111/asn'
curl 'ipu.usestrict.dev/json?ip=2606:4700:4700::1111'
curl -H 'Accept: application/json' ipu.usestrict.dev/1.1.1.1
wget -qO- ipu.usestrict.dev/country
http ipu.usestrict.dev/json
```

JSON fields: `ip`, `network`, `network_source`, `continent`, `country`, `country_code`, `region`, `city`, `timezone`, `latitude`, `longitude`, `accuracy_radius`, `asn`, `asn_organization`, `private_address`, `ipv6`, `address_type`, `database`, and `meta` (`cached`, `lookup_ms`). IPv4-mapped IPv6 is normalized to IPv4. `private_address` includes private/unique-local, loopback and link-local addresses; other reserved ranges have their own `address_type`.

## Configuration and reverse proxies

Copy `.env.example` to `.env` if needed; Bun loads it automatically. `HOST` defaults to `0.0.0.0`, `PORT` to `3000`. `MAXMIND_CITY_DB` and `MAXMIND_ASN_DB` override database paths.

Forwarding headers are ignored by default. If a reverse proxy sits in front of IPU, set `TRUSTED_PROXIES` to the actual proxy IPs/CIDRs. For a proxy on the same machine:

```dotenv
TRUSTED_PROXIES=127.0.0.1/32,::1/128
```

The proxy must overwrite or append `X-Forwarded-For`, and direct origin access should follow your deployment's intended boundary. IPU walks the chain from right to left and stops at the first untrusted hop; it does not trust arbitrary `CF-Connecting-IP` or `X-Real-IP` headers. Never put every public network into the trust list.

## Performance and privacy

- Local MMDB readers stay open in memory; no DNS or remote API calls on the lookup path.
- Server LRU: at most **10,000 IPs**, with **one-hour validity**. Expired entries are replaced on access or evicted; the bounded cache is process-local and is cleared on restart.
- Browser memory: at most **100 results**, valid for **five minutes**, cleared on reload. IP history is not stored in localStorage; only the theme preference is persisted.
- The initial response embeds the resolved data, avoiding a second API round trip. The globe is a separate lazy-loaded bundle and does not block lookup. Drawing is capped at 30 fps and paused when the globe is offscreen or the tab is hidden; reduced motion freezes automatic rotation.
- Bundled assets are fingerprinted, held in memory and gzip-compressed once at startup. They use immutable caching. IP-specific HTML/JSON/text use `private, no-store` so shared caches cannot leak another visitor's address.
- `Server-Timing: lookup;dur=…` and `X-IPU-Cache: HIT|MISS` expose actual lookup work. Lookup timing excludes network transit and rendering; it is not a promise of end-to-end latency.
- No request/IP logging or analytics in the application. Any reverse proxy logs are controlled by the deployment operator.

## Checks

```sh
bun check
bun fmt --check
bun test
bunx --bun playwright install chromium
bun run test:e2e
```

Run `bun fmt` to apply formatting. Type checking and formatting use Bun's native tools; no standalone TypeScript compiler or formatter is required. `bun check` reads the project's `tsconfig.json`. `bun run typecheck`, `bun run format` and `bun run format:check` are aliases for these commands.

Unit/integration checks cover real MMDB results, IPv4/IPv6 validation, CIDR masking, missing/private data, TTL/LRU behavior, proxy spoofing, HTML/JSON/text contracts, bootstrap escaping and gzip negotiation. Browser checks cover theme persistence, clipboard, initial data, cache reuse, errors/retry, IPv6, no-JavaScript fallback and both themes at 320/390/768/1440px. Browser checks use a separate local server on port 3011; build first.

## Design

The “product performs” direction puts the visitor's address at the center of a personal atlas. Neutral newsprint/charcoal, brass location markers, Work Sans and a real geographic globe connect the landing page to the working interface. The [GitHub homepage featured on Awwwards](https://www.awwwards.com/sites/github-homepage) informed the global-network treatment. No stock photos, invented metrics, placeholder organizations or tracking scripts are used.

The IPU wordmark folds its letters in 3D while its brass marker orbits them. The native Web Animations API plays a short sequence on header entry, pointer entry or keyboard focus; it does not loop or shift the layout. Reduced motion disables playback, and changing that preference or hiding the tab cancels an active sequence.
