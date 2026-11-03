import guide from "./content/api.md" with { type: "text" };
import robots from "../public/robots.txt" with { type: "text" };
import { openapi } from "./openapi";

export const siteURL = "https://ipu.usestrict.dev";
export const description =
  "Find your IP address, network CIDR, ASN and approximate location. Look up IPv4 or IPv6 in your browser or use IPU's free JSON API. No API key required.";

export function metadata(docs = false) {
  const title = docs
    ? "IPU API reference — IPv4 & IPv6 lookup"
    : "IPU — IP address lookup, location & network info";
  const canonical = `${siteURL}${docs ? "/docs" : "/"}`;
  const structured = docs
    ? {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: title,
        description,
        url: canonical,
        inLanguage: "en",
        author: {
          "@type": "Person",
          name: "Ali Torki",
          url: "https://github.com/ali-master",
        },
      }
    : {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${siteURL}/#website`,
            name: "IPU",
            alternateName: "IP, meet you.",
            url: canonical,
            inLanguage: "en",
            description,
          },
          {
            "@type": "WebApplication",
            "@id": `${siteURL}/#app`,
            name: "IPU",
            url: canonical,
            description,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Any",
            isAccessibleForFree: true,
            image: `${siteURL}/social-preview.png`,
            author: {
              "@type": "Person",
              name: "Ali Torki",
              sameAs: [
                "https://github.com/ali-master",
                "https://linkedin.com/in/alitorki",
              ],
            },
          },
        ],
      };
  return `<title>${title}</title>
<meta name="description" content="${description}">
<meta name="author" content="Ali Torki">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="${siteURL}/docs.md" title="API reference (Markdown)">
<link rel="describedby" type="application/vnd.oai.openapi+json" href="${siteURL}/openapi.json">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IPU">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${siteURL}/social-preview.png">
<meta property="og:image:width" content="1731">
<meta property="og:image:height" content="909">
<meta property="og:image:alt" content="IPU — IP, meet you. A sculpted U with a brass location dot.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${siteURL}/social-preview.png">
<meta name="twitter:image:alt" content="IPU — IP, meet you.">
<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, "\\u003c")}</script>`;
}

const docsHTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${metadata(true)}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.65;background:light-dark(#f3f3ee,#161715);color:light-dark(#20211d,#e7e7df)}
body{max-width:780px;margin:auto;padding:clamp(20px,5vw,56px)}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:2px solid;outline-offset:4px}
h1{font-size:clamp(2rem,6vw,3rem);line-height:1.15;letter-spacing:-.04em}h2{margin-top:2rem}nav{display:flex;flex-wrap:wrap;gap:1rem}pre{overflow:auto;padding:1rem;background:light-dark(#e5e6de,#262821);border-radius:8px}code{font-size:.9em;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{padding:.65rem;text-align:left;border-bottom:1px solid #8885;overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}
</style></head><body><nav aria-label="Documentation"><a href="/">← IPU</a><a href="/docs.md">Markdown</a><a href="/openapi.json">OpenAPI</a></nav><main>${Bun.markdown.html(guide)}</main></body></html>`;

export const discoveryLinks =
  '</docs>; rel="service-doc"; type="text/html", </openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </llms.txt>; rel="describedby"; type="text/plain"';

export const documents = new Map([
  ["/docs", { type: "text/html; charset=utf-8", body: docsHTML }],
  ["/docs.md", { type: "text/markdown; charset=utf-8", body: guide }],
  [
    "/openapi.json",
    { type: "application/json; charset=utf-8", body: JSON.stringify(openapi) },
  ],
  [
    "/robots.txt",
    {
      type: "text/plain; charset=utf-8",
      body: robots,
    },
  ],
  [
    "/sitemap.xml",
    {
      type: "application/xml; charset=utf-8",
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteURL}/</loc></url><url><loc>${siteURL}/docs</loc></url></urlset>`,
    },
  ],
  [
    "/llms.txt",
    {
      type: "text/plain; charset=utf-8",
      body: `# IPU

> Read-only IPv4 and IPv6 lookup: IP, network CIDR, ASN and approximate location. No account or API key.

Use GET ${siteURL}/{ip}/json for a full lookup. For a single field use /{ip}/ip, /{ip}/country, /{ip}/network or /{ip}/asn. Without an explicit IP, results describe the caller's connection, not the end user's device. Missing JSON values are null; location is approximate.

## Reference
- [API guide](${siteURL}/docs.md): Endpoints, response fields, errors and caching.
- [OpenAPI](${siteURL}/openapi.json): Machine-readable request and response schemas.
- [Website](${siteURL}/): Interactive lookup and API examples.
`,
    },
  ],
]);
