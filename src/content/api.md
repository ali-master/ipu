# IPU API reference

IPU looks up IPv4 and IPv6 addresses and returns network, ASN and approximate location data. No account or API key is required. All endpoints are read-only and support GET and HEAD.

Base URL: **{{SITE_URL}}**

The website also requests `https://cloudflare.com/cdn-cgi/trace` directly from your browser. Its Cloudflare trace describes your own connection, even while viewing another IP. It is separate from the lookup API and stays in page memory until refreshed or closed.

## Quick start

```sh
curl {{SITE_URL}}/1.1.1.1/json
curl {{SITE_URL}}/2606:4700:4700::1111/country
curl {{SITE_URL}}/ip
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

### WebMCP browser tools

On the interactive page, supported browsers expose two native `document.modelContext` tools:

| Tool                 | Input                         | Behavior                                                                                                                                       |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookup_ip`          | `{ "ip": "8.8.8.8" }` or `{}` | Looks up an address and updates the search field, results, globe and URL. Omit `ip` for this browser's connection, including its proxy or VPN. |
| `get_current_result` | `{}`                          | Reads the displayed result without a request or page change; returns `busy` during a pending lookup.                                           |

Results are JSON strings: `{ "ok": true, "connection": false, "location_is_approximate": true, "data": { ... }, "meta": { ... } }`, or `{ "ok": false, "error": { "code": "invalid_ip", "message": "..." } }`. `connection: true` means the browser's connection; false means an explicitly searched address. Missing fields remain `null`. After a failed search, the previous successful result remains displayed and readable.

WebMCP uses the same validation, cache and lookup flow as the UI. It accepts IP addresses, never arbitrary URLs. The latest lookup wins; a newer user/agent request cancels the previous one. Cancellation is honored until the result is committed to React and the URL, with a 15-second request timeout. Success confirms that commit; cancelling afterward does not undo it.

Registration is feature-detected and rolled back as a batch on failure. Tools are removed on unmount and are restricted to the same origin with `Permissions-Policy: tools=(self)`. Geolocation outputs carry `untrustedContentHint`; lookup declares its page changes and is non-consequential, while reading the displayed result is read-only. No SDK, extension or remote MCP server is required by IPU.

For local testing, enable `chrome://flags/#enable-webmcp-testing` and relaunch a supporting Chrome build. In DevTools on the interactive page:

```js
const context = document.modelContext;
const tools = await context.getTools();
const lookup = tools.find((tool) => tool.name === "lookup_ip");
JSON.parse(await context.executeTool(lookup, { ip: "8.8.8.8" }));
```

WebMCP remains experimental. To participate in Chrome's origin trial on your deployed HTTPS origin, obtain a matching token and set `WEBMCP_ORIGIN_TRIAL_TOKEN`; IPU sends it in the `Origin-Trial` header on interactive HTML responses. Invalid or expired tokens do not enable the feature. Without browser support, the UI, HTTP API and Markdown guide continue to work. WebMCP tools require an open page; server-side agents can use `/{ip}/json` directly.

Implementation reference (checked November 3, 2026): [Chrome Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices), [tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools), and [origin trials](https://developer.chrome.com/docs/web-platform/origin-trials).

### HTTP discovery

- [OpenAPI schema]({{SITE_URL}}/openapi.json)
- [Compact agent index]({{SITE_URL}}/llms.txt)
- [IPU home]({{SITE_URL}}/)
- [Source code](https://github.com/ali-master/ipu)

Created by [Ali Torki](https://github.com/ali-master) · [LinkedIn](https://linkedin.com/in/alitorki)
