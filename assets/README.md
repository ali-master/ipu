# Database provenance

IPU includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.

The City database was supplied by the project owner. The optional ASN database was downloaded on November 03, 2026 from the public P3TERX mirror: https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-ASN.mmdb. Its internal build date is October 31, 2026.

The authoritative source is https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/. See the MaxMind GeoLite2 terms and the mirror attribution at https://github.com/P3TERX/GeoLite.mmdb. Database licensing is separate from application dependencies.

| File                          | Internal build date | SHA-256                                                          |
| ----------------------------- | ------------------- | ---------------------------------------------------------------- |
| GeoLite2-City-2026-06-05.mmdb | 2026-06-05          | fbcc082ba404d1c99760e60d3efaf7205ae059fb10dbb3ebf877f469832fc7bf |
| GeoLite2-ASN.mmdb             | 2026-10-31          | 149e22495c37ce2247114878584c8014824fb342a02aaf1ff5be953479851933 |

MMDB files are server-only and never served as static assets. Replace them deliberately and restart IPU to load new records and clear old cached results.
