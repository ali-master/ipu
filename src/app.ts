import { Elysia } from "elysia";
import type { Lookup } from "./lookup";
import { normalizeIP } from "./lookup";
import type { IPInfo } from "./shared";

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
  assets?: Map<string, { body: Blob; gzip: Blob }>;
}) {
  return new Elysia().all("/*", ({ request }) => {
    const url = new URL(request.url);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      Vary: "Accept, User-Agent",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
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
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            Vary: "Accept-Encoding",
            ...(gzip ? { "Content-Encoding": "gzip" } : {}),
          },
        },
      );
    }
    if (url.pathname === "/health")
      return request.method === "HEAD"
        ? new Response(null, { headers })
        : Response.json({ status: "ok" }, { headers });
    const routes = ["/", "/json", "/ip", "/country", "/network", "/asn"];
    let explicit: string | null = null;
    try {
      if (!routes.includes(url.pathname))
        explicit = normalizeIP(decodeURIComponent(url.pathname.slice(1)));
      else if (url.searchParams.has("ip"))
        explicit = normalizeIP(url.searchParams.get("ip")!);
    } catch {
      return Response.json(
        {
          error: routes.includes(url.pathname)
            ? "Enter a valid IPv4 or IPv6 address."
            : "Unknown endpoint or invalid IP address.",
        },
        { status: routes.includes(url.pathname) ? 400 : 404, headers },
      );
    }
    const ip = explicit ?? options.clientIP(request);
    if (!ip)
      return Response.json(
        { error: "Could not resolve the client IP." },
        { status: 503, headers },
      );
    const result = options.lookup(ip);
    headers.set(
      "Server-Timing",
      `lookup;dur=${result.meta.lookup_ms.toFixed(3)}`,
    );
    headers.set("X-IPU-Cache", result.meta.cached ? "HIT" : "MISS");
    const accepts = request.headers.get("accept") ?? "";
    const browser = accepts.includes("text/html");
    if (
      (url.pathname === "/" || (explicit && !routes.includes(url.pathname))) &&
      browser
    ) {
      const bootstrap = JSON.stringify(result).replace(/</g, "\\u003c");
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      return new Response(
        request.method === "HEAD"
          ? null
          : options.html.replace("__IPU_BOOTSTRAP__", () => bootstrap),
        { headers },
      );
    }
    if (url.pathname === "/json" || accepts.includes("application/json")) {
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
    const field = fields[url.pathname];
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
