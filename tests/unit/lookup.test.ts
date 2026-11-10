import { describe, expect, test } from "bun:test";
import { createLookup, networkCIDR, normalizeIP } from "../../src/lookup";
import { createClientResolver } from "../../src/client-ip";

const service = await createLookup();
describe("local database lookup", () => {
  test("reads the built City and ASN databases", () => {
    const { data } = service.lookup("88.198.53.22");
    expect(data.country_code).toBe("DE");
    expect(data.city).toBe("Falkenstein");
    expect(data.asn).toBe(24940);
    expect(data.asn_organization).toBe("Hetzner Online GmbH");
    expect(data.timezone).toBe("Europe/Berlin");
    expect(data.database.city).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.latitude).toBeCloseTo(50.48, 1);
    // The public sources carry no accuracy radius.
    expect(data.accuracy_radius).toBeNull();
    // Prefix lengths shift between rebuilds; the network must still hold the IP.
    expect(data.network).toMatch(/^88\.198\.\d+\.0\/2\d$/);
    expect(data.network_source).toBe("city");
  });
  test("normalizes mapped IPv4 and compressed IPv6", () => {
    expect(normalizeIP("::ffff:1.1.1.1")).toBe("1.1.1.1");
    expect(normalizeIP("2606:4700:4700:0000:0000:0000:0000:1111")).toBe(
      "2606:4700:4700::1111",
    );
    const { data } = service.lookup("2606:4700:4700::1111");
    expect(data.ipv6).toBe(true);
    expect(data.asn).toBe(13335);
  });
  test.each([
    "127.1",
    "0127.0.0.1",
    "::ffff:0127.0.0.1",
    "1.2.3.999",
    "hello",
    "https://1.1.1.1",
    "fe80::1%en0",
    "1.1.1.1/24",
    "",
  ])("rejects invalid or ambiguous IP %s", (ip) => {
    expect(() => normalizeIP(ip)).toThrow();
  });
  test.each([
    "127.0.0.1",
    "10.2.3.4",
    "192.168.1.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("does not invent location for private %s", (ip) => {
    const { data } = service.lookup(ip);
    expect(data.private_address).toBe(true);
    expect(data.country).toBeNull();
    expect(data.asn).toBeNull();
    expect(data.network).toBeNull();
  });
  test("distinguishes reserved from private", () => {
    expect(service.lookup("192.0.2.1").data.private_address).toBe(false);
    expect(service.lookup("192.0.2.1").data.address_type).toBe("reserved");
    expect(service.lookup("224.0.0.1").data.country).toBeNull();
  });
  test("masks IPv4 and IPv6 CIDRs", () => {
    expect(networkCIDR("88.198.53.22", 22)).toBe("88.198.52.0/22");
    expect(networkCIDR("2606:4700:4700::1111", 48)).toBe("2606:4700:4700::/48");
    expect(networkCIDR("1.2.3.4", 0)).toBe("0.0.0.0/0");
    expect(networkCIDR("1.2.3.4", 32)).toBe("1.2.3.4/32");
  });
  test("bounded LRU cache expires without extending TTL on hits", async () => {
    let time = 0;
    const { lookup, cache } = await createLookup({
      capacity: 2,
      ttl: 10,
      now: () => time,
    });
    expect(lookup("1.1.1.1").meta.cached).toBe(false);
    lookup("8.8.8.8");
    time = 5;
    expect(lookup("::ffff:1.1.1.1").meta.cached).toBe(true);
    lookup("9.9.9.9");
    expect(cache.size).toBe(2);
    expect(cache.has("8.8.8.8")).toBe(false);
    time = 11;
    expect(lookup("1.1.1.1").meta.cached).toBe(false);
  });
  test("missing optional ASN database is explicit", async () => {
    const { lookup } = await createLookup({
      asnPath: "assets/not-installed.mmdb",
    });
    const data = lookup("88.198.53.22").data;
    expect(data.asn).toBeNull();
    expect(data.network).toMatch(/^88\.198\.\d+\.0\/2\d$/);
    expect(data.network_source).toBe("city");
  });
});

describe("trusted proxy boundary", () => {
  const req = (chain: string) =>
    new Request("http://ipu/", { headers: { "x-forwarded-for": chain } });
  test("ignores spoofed headers by default", () => {
    expect(createClientResolver()(req("8.8.8.8"), "1.1.1.1")).toBe("1.1.1.1");
  });
  test("only walks trusted hops from the right", () => {
    const resolve = createClientResolver("127.0.0.1/32,10.0.0.0/8,::1/128");
    expect(resolve(req("9.9.9.9, 1.1.1.1, 10.0.0.2"), "127.0.0.1")).toBe(
      "1.1.1.1",
    );
    expect(resolve(req("8.8.8.8"), "::ffff:127.0.0.1")).toBe("8.8.8.8");
    expect(resolve(req("garbage"), "::1")).toBe("::1");
    expect(resolve(req("8.8.8.8"), null)).toBeNull();
  });
});
