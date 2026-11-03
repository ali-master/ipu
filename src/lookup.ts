import { open, type CityResponse, type AsnResponse } from "maxmind";
import ipaddr from "ipaddr.js";
import type { IPInfo, LookupResult } from "./shared";

export function normalizeIP(input: string): string {
  const value = input.trim();
  if (
    value.length > 45 ||
    value.includes("%") ||
    (value.includes(".") &&
      !ipaddr.IPv4.isValidFourPartDecimal(
        value.slice(value.lastIndexOf(":") + 1),
      )) ||
    !(
      ipaddr.IPv4.isValidFourPartDecimal(value) ||
      (value.includes(":") && ipaddr.IPv6.isValid(value))
    )
  ) {
    throw new Error("Enter a valid IPv4 or IPv6 address.");
  }
  return ipaddr.process(value).toString();
}

export function networkCIDR(ip: string, prefix: number): string {
  const address = ipaddr.parse(ip);
  const bytes = address
    .toByteArray()
    .map(
      (byte, i) => byte & (255 << Math.max(0, Math.min(8, i * 8 + 8 - prefix))),
    );
  return `${ipaddr.fromByteArray(bytes).toString()}/${prefix}`;
}

export async function createLookup(
  options: {
    cityPath?: string;
    asnPath?: string;
    capacity?: number;
    ttl?: number;
    now?: () => number;
  } = {},
) {
  const city = await open<CityResponse>(
    options.cityPath ??
      Bun.env.MAXMIND_CITY_DB ??
      "assets/GeoLite2-City-2026-06-05.mmdb",
  );
  const asnPath =
    options.asnPath ?? Bun.env.MAXMIND_ASN_DB ?? "assets/GeoLite2-ASN.mmdb";
  const asn = (await Bun.file(asnPath).exists())
    ? await open<AsnResponse>(asnPath)
    : null;
  if (!city.metadata.databaseType.includes("City"))
    throw new Error("MAXMIND_CITY_DB must be a City database.");
  if (asn && !asn.metadata.databaseType.includes("ASN"))
    throw new Error("MAXMIND_ASN_DB must be an ASN database.");
  if (!asn) console.warn("ASN database unavailable; ASN fields will be null.");
  const date = (epoch: Date) => epoch.toISOString().slice(0, 10);
  const database = {
    city: date(city.metadata.buildEpoch),
    asn: asn ? date(asn.metadata.buildEpoch) : null,
  };
  const cache = new Map<string, { data: IPInfo; expires: number }>();
  const capacity = options.capacity ?? 10_000;
  const ttl = options.ttl ?? 3_600_000;
  const now = options.now ?? Date.now;

  function lookup(input: string): LookupResult {
    const start = performance.now();
    const ip = normalizeIP(input);
    const hit = cache.get(ip);
    if (hit && hit.expires > now()) {
      cache.delete(ip);
      cache.set(ip, hit);
      return {
        data: hit.data,
        meta: { cached: true, lookup_ms: performance.now() - start },
      };
    }
    cache.delete(ip);
    const address = ipaddr.parse(ip);
    const range = address.range();
    const isPublic = range === "unicast";
    const [geo, cityPrefix] = isPublic
      ? city.getWithPrefixLength(ip)
      : [null, 0];
    const [owner, asnPrefix] =
      isPublic && asn ? asn.getWithPrefixLength(ip) : [null, 0];
    const data: IPInfo = {
      ip,
      network: geo
        ? networkCIDR(ip, cityPrefix)
        : owner
          ? networkCIDR(ip, asnPrefix)
          : null,
      network_source: geo ? "city" : owner ? "asn" : null,
      continent: geo?.continent?.names?.en ?? null,
      country: geo?.country?.names?.en ?? null,
      country_code: geo?.country?.iso_code ?? null,
      region: geo?.subdivisions?.[0]?.names?.en ?? null,
      city: geo?.city?.names?.en ?? null,
      timezone: geo?.location?.time_zone ?? null,
      latitude: geo?.location?.latitude ?? null,
      longitude: geo?.location?.longitude ?? null,
      accuracy_radius: geo?.location?.accuracy_radius ?? null,
      asn: owner?.autonomous_system_number ?? null,
      asn_organization: owner?.autonomous_system_organization ?? null,
      private_address: [
        "private",
        "uniqueLocal",
        "loopback",
        "linkLocal",
      ].includes(range),
      ipv6: address.kind() === "ipv6",
      address_type: range,
      database,
    };
    if (cache.size >= capacity) cache.delete(cache.keys().next().value!);
    cache.set(ip, { data, expires: now() + ttl });
    return {
      data,
      meta: { cached: false, lookup_ms: performance.now() - start },
    };
  }
  return { lookup, cache };
}
export type Lookup = Awaited<ReturnType<typeof createLookup>>["lookup"];
