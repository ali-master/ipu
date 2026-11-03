# IPU API reference

IPU looks up IPv4 and IPv6 addresses and returns network, ASN and approximate location data. No account or API key is required. All endpoints are read-only and support GET and HEAD.

Base URL: **https://ipu.usestrict.dev**

## Quick start

```sh
curl https://ipu.usestrict.dev/1.1.1.1/json
curl https://ipu.usestrict.dev/2606:4700:4700::1111/country
curl https://ipu.usestrict.dev/ip
```

For agents, use `/{ip}/json` for one complete response, or a focused endpoint when only one field is needed. Pass the user's IP explicitly: without an IP, the result describes the caller's connection (for an agent, usually its server), not the user's device.

## Endpoints

| Path               | Result                                                   |
| ------------------ | -------------------------------------------------------- |
| `/`                | HTML for `Accept: text/html`; otherwise a text summary   |
| `/json`            | Full JSON response                                       |
| `/ip`              | IP address as plain text                                 |
| `/country`         | Country name as plain text                               |
| `/network`         | Network CIDR as plain text                               |
| `/asn`             | ASN number as plain text                                 |
| `/{ip}`            | Summary for a specific IPv4 or IPv6 address              |
| `/{ip}/{endpoint}` | Explicit-IP version of json, ip, country, network or asn |
| `/health`          | Service readiness: `{"status":"ok"}`                     |

`?ip=1.1.1.1` also works on `/`, `/json`, `/ip`, `/country`, `/network` and `/asn`. A path IP takes precedence over the query parameter. `Accept: application/json` returns the full JSON payload on lookup routes; on `/` and `/{ip}`, HTML takes precedence when both media types are requested. Focused endpoints otherwise return plain text with a trailing newline.

## Response fields

JSON includes `ip`, `network`, `network_source`, `continent`, `country`, `country_code`, `region`, `city`, `timezone`, `latitude`, `longitude`, `accuracy_radius` (kilometres), `asn`, `asn_organization`, `private_address`, `ipv6`, `address_type`, `database` (city and ASN database dates), and `meta` (cached and lookup_ms).

Missing JSON values are `null`; missing plain-text values are `Unavailable`. Location is approximate, never a street address or proof of someone's physical location. Private and reserved IPs may have no geographic or ASN data. Network CIDR comes from the available ASN or city database record; it is not a live routing-table lookup.

## Errors and caching

Errors are JSON with an `error` string: 400 for invalid input on a known endpoint, 404 for unknown paths or invalid bare-IP paths, and 503 when the caller IP cannot be resolved. Other methods return 405 with plain text and `Allow: GET, HEAD`. HEAD sends the same status and headers as GET without a body.

Lookups use a temporary in-process cache. Responses use `Cache-Control: private, no-store` to avoid shared caching of caller-specific data. Check the HTTP status before parsing; retry transient network failures or 503 responses with backoff. Geolocation can be incomplete or change as databases are updated.

## Discovery

- [OpenAPI schema](https://ipu.usestrict.dev/openapi.json)
- [Compact agent index](https://ipu.usestrict.dev/llms.txt)
- [IPU home](https://ipu.usestrict.dev/)
- [Source code](https://github.com/ali-master/ipu)

Created by [Ali Torki](https://github.com/ali-master) · [LinkedIn](https://linkedin.com/in/alitorki)
