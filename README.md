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

