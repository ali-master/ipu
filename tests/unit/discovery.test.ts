import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/app";
import { documents, siteURL } from "../../src/discovery";
import { openapi } from "../../src/openapi";

const app = createApp({
  lookup: () => {
    throw new Error("Public documents must not perform a lookup");
  },
  clientIP: () => null,
  html: await Bun.file("src/client/index.html").text(),
});
const get = (path: string, method = "GET", headers = {}) =>
  app.handle(new Request(`http://localhost${path}`, { method, headers }));

describe("Search and agent discovery", () => {
  test("all discovery surfaces use the configured origin", async () => {
    for (const path of [
      "/docs",
      "/docs.md",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
    ]) {
      const body = await (await get(path)).text();
      expect(body).toContain(siteURL);
      expect(body).not.toContain("{{SITE_URL}}");
    }
    const schema = await (await get("/openapi.json")).json();
    expect(schema.servers).toEqual([{ url: siteURL }]);
    expect(schema.externalDocs.url).toBe(`${siteURL}/docs`);
    expect((await get("/docs.md")).headers.get("link")).toContain(
      `<${siteURL}/docs>; rel="canonical"`,
    );
    const html = await (
      await get("/", "GET", { accept: "text/html", host: "untrusted.example" })
    ).text();
    expect(html).toContain(`content="${siteURL}/social-preview.png"`);
    expect(html).not.toContain("<!-- IPU_METADATA -->");
    expect(html).not.toContain("untrusted.example");
  });

  test("public documents work without a client IP, support HEAD and expose discovery links", async () => {
    for (const [path, document] of documents) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(document.type);
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=3600",
      );
      expect(response.headers.get("link")).toContain("/openapi.json");
      expect(await response.text()).toBe(document.body);
      const head = await get(path, "HEAD");
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      expect(head.headers.get("content-type")).toBe(document.type);
      expect((await get(path, "POST")).status).toBe(405);
    }
  });

  test("initial HTML contains useful content, metadata and an accessible lookup even without a resolved IP", async () => {
    const response = await get("/", "GET", { accept: "text/html" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const html = await response.text();
    expect(html).toContain("<h1>IPU — IP, meet you.</h1>");
    expect(html).toContain('action="/json"');
    expect(html).toContain('href="/docs"');
    expect(html).toContain(`<link rel="canonical" href="${siteURL}/">`);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain("__IPU_BOOTSTRAP__");
    const schema = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!,
    );
    expect(
      schema["@graph"].map((node: { "@type": string }) => node["@type"]),
    ).toEqual(["WebSite", "WebApplication"]);
    expect((await get("/json")).status).toBe(503);
  });

  test("only canonical public pages are in the sitemap; API and error responses stay out of search", async () => {
    expect((await get("/docs")).headers.get("x-robots-tag")).toBeNull();
    for (const path of [
      "/json",
      "/health",
      "/missing",
      "/openapi.json",
      "/?ip=invalid",
    ]) {
      expect((await get(path)).headers.get("x-robots-tag")).toBe("noindex");
    }
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(
      [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    ).toEqual([`${siteURL}/`, `${siteURL}/docs`]);
    const robots = await (await get("/robots.txt")).text();
    expect(robots).toBe(
      (await Bun.file("src/content/robots.txt").text()).replaceAll(
        "{{SITE_URL}}",
        siteURL,
      ),
    );
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain(`${siteURL}/sitemap.xml`);
    expect((await get("/docs.md")).headers.get("link")).toContain(
      `"canonical"`,
    );
  });

  test("OpenAPI covers every data route and nullable field, with unique operations", async () => {
    const schema = await (await get("/openapi.json")).json();
    expect(schema.openapi).toBe("3.1.0");
    expect(Object.keys(schema.paths)).toHaveLength(13);
    const ids = new Set();
    for (const path of [
      "/",
      "/json",
      "/ip",
      "/country",
      "/network",
      "/asn",
      "/{ip}",
      "/{ip}/json",
      "/{ip}/ip",
      "/{ip}/country",
      "/{ip}/network",
      "/{ip}/asn",
      "/health",
    ]) {
      for (const method of ["get", "head"]) {
        const operation = schema.paths[path][method];
        expect(ids.has(operation.operationId)).toBe(false);
        ids.add(operation.operationId);
        expect(operation.responses["200"]).toBeDefined();
        if (method === "head")
          expect(operation.responses["200"].content).toBeUndefined();
      }
    }
    expect(openapi.components.schemas.Lookup.properties.country).toEqual({
      type: ["string", "null"],
    });
    expect(schema.components.schemas.Lookup.required).toContain("meta");
    expect(schema.security).toEqual([]);
  });
});
