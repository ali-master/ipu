import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/app";
import { createLookup } from "../../src/lookup";

const { lookup } = await createLookup();
const app = createApp({
  lookup,
  clientIP: () => "88.198.53.22",
  html: '<html><script id="ipu-data" type="application/json">__IPU_BOOTSTRAP__</script></html>',
});
const get = (path: string, headers?: Record<string, string>) =>
  app.handle(new Request(`http://localhost${path}`, { headers }));
describe("HTTP contract", () => {
  test("curl root returns full readable summary", async () => {
    const response = await get("/");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toContain("Falkenstein");
  });
  test("browser receives escaped boot data in the first response", async () => {
    const response = await get("/", { accept: "text/html" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain('"ip":"88.198.53.22"');
    expect(body).not.toContain("__IPU_BOOTSTRAP__");
    expect(response.headers.get("server-timing")).toContain("lookup;dur=");
  });
  test("JSON and focused endpoints expose actual data", async () => {
    expect((await (await get("/json")).json()).asn).toBe(24940);
    for (const [path, text] of [
      ["/ip", "88.198.53.22\n"],
      ["/country", "Germany\n"],
      ["/asn", "24940\n"],
    ]) {
      expect(await (await get(path!)).text()).toBe(text!);
    }
    expect(await (await get("/network")).text()).toMatch(
      /^88\.198\..*\/\d+\n$/,
    );
  });
  test("explicit IPv4 and IPv6 lookups, query and content negotiation", async () => {
    expect((await (await get("/json?ip=1.1.1.1")).json()).ip).toBe("1.1.1.1");
    expect(
      (
        await (
          await get("/2606:4700:4700::1111", { accept: "application/json" })
        ).json()
      ).ipv6,
    ).toBe(true);
    expect(await (await get("/country?ip=127.0.0.1")).text()).toBe(
      "Unavailable\n",
    );
    expect(
      (await (await get("/", { accept: "application/json" })).json()).country,
    ).toBe("Germany");
  });
  test("rejects invalid input, unknown paths and unsafe methods", async () => {
    expect((await get("/json?ip=nope")).status).toBe(400);
    expect((await get("/json?ip=")).status).toBe(400);
    expect((await get("/favicon-nope.ico")).status).toBe(404);
    expect((await get("/assets/GeoLite2-ASN.mmdb")).status).toBe(404);
    expect(
      (
        await app.handle(
          new Request("http://localhost/json", { method: "POST" }),
        )
      ).status,
    ).toBe(405);
    const head = await app.handle(
      new Request("http://localhost/json", { method: "HEAD" }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
  test("unresolved client IP is an error, never a demo address", async () => {
    const noPeer = createApp({ lookup, clientIP: () => null, html: "" });
    expect(
      (await noPeer.handle(new Request("http://localhost/json"))).status,
    ).toBe(503);
  });
  test("boot JSON cannot close its script or interpolate replacement tokens", async () => {
    const result = lookup("1.1.1.1");
    const organization = "</script><script>alert(1)</script>$&";
    const injected = createApp({
      lookup: () => ({
        ...result,
        data: { ...result.data, asn_organization: organization },
      }),
      clientIP: () => "1.1.1.1",
      html: '<script type="application/json">__IPU_BOOTSTRAP__</script>',
    });
    const response = await injected.handle(
      new Request("http://localhost/", { headers: { accept: "text/html" } }),
    );
    const html = await response.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("__IPU_BOOTSTRAP__");
    expect(
      JSON.parse(
        html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>")),
      ).data.asn_organization,
    ).toBe(organization);
  });
  test("static assets are compressed once and respect gzip quality zero", async () => {
    const source = "console.log('IPU');";
    const assets = new Map([
      [
        "/app-hash.js",
        {
          body: new Blob([source], { type: "text/javascript" }),
          gzip: new Blob([new Uint8Array(Bun.gzipSync(source))]),
        },
      ],
    ]);
    const staticApp = createApp({
      lookup,
      clientIP: () => null,
      html: "",
      assets,
    });
    const request = (encoding: string) =>
      staticApp.handle(
        new Request("http://localhost/app-hash.js", {
          headers: { "accept-encoding": encoding },
        }),
      );
    const compressed = await request("br, gzip;q=0.8");
    expect(compressed.headers.get("content-encoding")).toBe("gzip");
    expect(
      new TextDecoder().decode(Bun.gunzipSync(await compressed.arrayBuffer())),
    ).toBe(source);
    expect(compressed.headers.get("vary")).toBe("Accept-Encoding");
    for (const encoding of ["gzip;q=0", "gzip;q=0.00", "identity"]) {
      const response = await request(encoding);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(await response.text()).toBe(source);
    }
  });
});
