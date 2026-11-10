# Database provenance

IPU reads two MMDB files from this folder: `ipu-city.mmdb` and `ipu-asn.mmdb`. They are not in Git; build them with:

```sh
bun run build:db
```

The [build script](../scripts/build-ip-db.ts) needs no account. It downloads the public [ip-location-db](https://github.com/sapics/ip-location-db/releases/tag/latest) release, verifies each file against GitHub's SHA-256 digest, and merges the sources. Sources are layered by priority; a later one only fills what earlier ones lack.

| Output        | Sources, highest priority first                   |
| ------------- | ------------------------------------------------- |
| ipu-city.mmdb | GeoLite2 City, DB-IP City Lite                    |
| ipu-asn.mmdb  | GeoLite2 ASN, origin-asn, DB-IP ASN Lite, IPtoASN |

The city file keeps GeoLite2's country and region and takes a DB-IP city only where GeoLite2 has none for the same country and region. Country and continent names are in English; `accuracy_radius` is not available from these sources and stays `null`.

Rebuild whenever you want fresher data: GeoLite2 updates twice weekly, origin-asn and IPtoASN daily, DB-IP monthly. Each file records its build date, which IPU reports as `database`.

## Licences

Database licensing is separate from application dependencies and travels with the data:

- **GeoLite2**: this product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com, under the [GeoLite2 terms](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/).
- **DB-IP Lite**: CC BY 4.0, which requires a visible link to [DB-IP.com](https://db-ip.com) on pages that show its results.
- **origin-asn, IPtoASN**: PDDL.

## Other databases

Any City or ASN MMDB in the GeoLite2 record shape works: point `MAXMIND_CITY_DB` and `MAXMIND_ASN_DB` at it. An original MaxMind GeoLite2 City file also fills `accuracy_radius`.

MMDB files are server-only and never served as static assets. Replace them deliberately and restart IPU to load new records and clear old cached results.
