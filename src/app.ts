import { Elysia } from "elysia";
import type { Lookup } from "./lookup";
import { normalizeIP } from "./lookup";
import type { IPInfo } from "./shared";
import { discoveryLinks, documents, metadata, siteURL } from "./discovery";

export function textSummary(data: IPInfo): string {
  return (
    [
      "IPU — IP, meet you.",
      ...Object.entries(data)
        .filter(([key]) => key !== "database")
        .map(([key, value]) => `${key.padEnd(20)} ${value ?? "Unavailable"}`),
    ].join("\n") + "\n"
  );
}

export function createApp(options: {
  lookup: Lookup;
  clientIP: (request: Request) => string | null;
  html: string;
  originTrialToken?: string;
  assets?: Map<string, { body: Blob; gzip: Blob }>;
}) {
  const html = options.html.replace("<!-- IPU_METADATA -->", () => metadata());
  return new Elysia().all("/*", ({ request }) => {
    const url = new URL(request.url);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      Vary: "Accept",
      Link: discoveryLinks,
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "tools=(self)",
    });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { ...Object.fromEntries(headers), Allow: "GET, HEAD" },
      });
    const asset = options.assets?.get(url.pathname);
    if (asset) {
      const gzip = (request.headers.get("accept-encoding") ?? "")
        .split(",")
        .some((encoding) =>
          /^gzip(?:\s*;\s*q=(?!0(?:\.0*)?$)[01](?:\.\d+)?)?$/i.test(
            encoding.trim(),
          ),
        );
      return new Response(
        request.method === "HEAD" ? null : gzip ? asset.gzip : asset.body,
        {
          headers: {
            "Content-Type": asset.body.type,
            "Cache-Control": ["/logo.svg", "/social-preview.png"].includes(
              url.pathname,
            )
              ? "public, max-age=3600"
              : "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            Vary: "Accept-Encoding",
            ...(gzip ? { "Content-Encoding": "gzip" } : {}),
          },
        },
      );
    }
    const document = documents.get(url.pathname);
    if (document) {
      headers.set("Content-Type", document.type);
      headers.set("Cache-Control", "public, max-age=3600");
      if (url.pathname === "/docs") headers.delete("X-Robots-Tag");
      if (url.pathname === "/docs.md")
        headers.append("Link", `<${siteURL}/docs>; rel="canonical"`);
      return new Response(request.method === "HEAD" ? null : document.body, {
        headers,
      });
    }
    if (url.pathname === "/health")
      return request.method === "HEAD"
        ? new Response(null, { headers })
        : Response.json({ status: "ok" }, { headers });
    const routes = ["/", "/json", "/ip", "/country", "/network", "/asn"];
    let route = url.pathname;
    let knownRoute = routes.includes(route);
    let explicit: string | null = null;
    try {
      if (!knownRoute) {
        const parts = url.pathname.slice(1).split("/");
        if (parts.length === 2 && parts[1] && routes.includes(`/${parts[1]}`)) {
          route = `/${parts[1]}`;
          knownRoute = true;
        } else if (parts.length === 1) {
          route = "/";
        } else {
          throw new Error("Unknown endpoint.");
        }
        explicit = normalizeIP(decodeURIComponent(parts[0]!));
      } else if (url.searchParams.has("ip"))
        explicit = normalizeIP(url.searchParams.get("ip")!);
    } catch {
      return Response.json(
        {
          error: knownRoute
            ? "Enter a valid IPv4 or IPv6 address."
            : "Unknown endpoint or invalid IP address.",
        },
        { status: knownRoute ? 400 : 404, headers },
      );
    }
    const ip = explicit ?? options.clientIP(request);
    const accepts = request.headers.get("accept") ?? "";
    const browser = accepts.includes("text/html");
    if (!ip && !(route === "/" && browser))
      return Response.json(
        { error: "Could not resolve the client IP." },
        { status: 503, headers },
      );
    const result = ip ? options.lookup(ip) : null;
    if (result) {
      headers.set(
        "Server-Timing",
        `lookup;dur=${result.meta.lookup_ms.toFixed(3)}`,
      );
      headers.set("X-IPU-Cache", result.meta.cached ? "HIT" : "MISS");
    }
    if (route === "/" && browser) {
      if (options.originTrialToken)
        headers.set("Origin-Trial", options.originTrialToken);
      if (!explicit && !url.search) headers.delete("X-Robots-Tag");
      const bootstrap = JSON.stringify(result).replace(/</g, "\\u003c");
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://cloudflare.com/cdn-cgi/trace; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      return new Response(
        request.method === "HEAD"
          ? null
          : html.replace("__IPU_BOOTSTRAP__", () => bootstrap),
        { headers },
      );
    }
    if (!result) throw new Error("Lookup result required for data endpoints.");
    if (route === "/json" || accepts.includes("application/json")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(
        request.method === "HEAD"
          ? null
          : JSON.stringify({ ...result.data, meta: result.meta }),
        { headers },
      );
    }
    const fields: Record<string, keyof IPInfo> = {
      "/ip": "ip",
      "/country": "country",
      "/network": "network",
      "/asn": "asn",
    };
    const field = fields[route];
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(
      request.method === "HEAD"
        ? null
        : field
          ? `${result.data[field] ?? "Unavailable"}\n`
          : textSummary(result.data),
      { headers },
    );
  });
}
