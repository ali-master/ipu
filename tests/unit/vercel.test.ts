import { expect, spyOn, test } from "bun:test";
import { vercelClientIP } from "../../src/client-ip";
import { prepareDatabase } from "../../scripts/build-vercel";

test("Vercel client IP trusts only its platform header and validates addresses", () => {
  const previous = Bun.env.VERCEL;
  try {
    const request = (ip?: string) =>
      new Request("https://ipu.example/ip", {
        headers: {
          "x-forwarded-for": "8.8.8.8",
          ...(ip ? { "x-vercel-forwarded-for": ip } : {}),
        },
      });
    delete Bun.env.VERCEL;
    expect(vercelClientIP(request("1.1.1.1"))).toBeNull();
    Bun.env.VERCEL = "1";
    expect(vercelClientIP(request("::ffff:1.1.1.1"))).toBe("1.1.1.1");
    expect(vercelClientIP(request("2606:4700:4700::1111"))).toBe(
      "2606:4700:4700::1111",
    );
    for (const ip of [undefined, "invalid", "1.1.1.1, 8.8.8.8"])
      expect(vercelClientIP(request(ip))).toBeNull();
  } finally {
    if (previous === undefined) delete Bun.env.VERCEL;
    else Bun.env.VERCEL = previous;
  }
});

test("database preparation checks missing inputs, HTTP errors and MMDB types", async () => {
  const path = `/tmp/ipu-database-test-${crypto.randomUUID()}.mmdb`;
  const download = spyOn(globalThis, "fetch");
  try {
    await expect(prepareDatabase(path, undefined, "City")).rejects.toThrow(
      "MAXMIND_CITY_DB_URL",
    );
    await prepareDatabase(path, undefined, "ASN");
    await expect(
      prepareDatabase(path, "http://example.test/db", "City"),
    ).rejects.toThrow("HTTPS");
    download.mockResolvedValue(new Response("Missing", { status: 404 }));
    await expect(
      prepareDatabase(path, "https://example.test/db", "City"),
    ).rejects.toThrow("404");
    expect(await Bun.file(path).exists()).toBe(false);
    download.mockResolvedValue(
      new Response(Bun.file("assets/GeoLite2-ASN.mmdb")),
    );
    await prepareDatabase(path, "https://example.test/db", "ASN");
    await expect(prepareDatabase(path, undefined, "City")).rejects.toThrow(
      "Expected a City",
    );
    download.mockClear();
    await prepareDatabase(path, "https://example.test/db", "ASN");
    expect(download).not.toHaveBeenCalled();
    await Bun.file(path).delete();
    download.mockResolvedValue(new Response("not a database"));
    await expect(
      prepareDatabase(path, "https://example.test/db", "City"),
    ).rejects.toThrow();
  } finally {
    download.mockRestore();
    if (await Bun.file(path).exists()) await Bun.file(path).delete();
  }
});
