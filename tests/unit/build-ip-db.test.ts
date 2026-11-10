import { expect, test } from "bun:test";
import { Reader, type CityResponse } from "maxmind";
import { parseIP, Trie } from "../../scripts/build-ip-db";

const ip = (text: string) => {
  const bytes = new Uint8Array(16);
  parseIP(text, bytes);
  return bytes;
};

test("layered ranges round-trip through the MMDB writer", () => {
  // Fill-only merge: the first source to claim an address keeps it.
  const trie = new Trie((old, id) => (old < 0 ? id : old));
  trie.insert(ip("10.0.1.0"), ip("10.0.2.127"), 0); // not CIDR-aligned
  trie.insert(ip("10.0.0.0"), ip("10.0.255.255"), 1); // wraps the range above
  trie.insert(ip("2001:db8::"), ip("2001:db8:0:ffff:ffff:ffff:ffff:ffff"), 2);
  trie.insert(ip("1.2.3.4"), ip("1.2.3.4"), 2);
  const names = ["first", "second", "third"];
  const bytes = trie.toMMDB("Test-City", "test", (id) => ({
    city: { names: { en: names[id] } },
    location: { latitude: -33.5, longitude: 151 },
  }));

  const reader = new Reader<CityResponse>(Buffer.from(bytes));
  const city = (address: string) => reader.get(address)?.city?.names.en ?? null;
  expect(reader.metadata.databaseType).toBe("Test-City");
  expect(city("10.0.0.255")).toBe("second");
  expect(city("10.0.1.0")).toBe("first");
  expect(city("10.0.2.127")).toBe("first");
  expect(city("10.0.2.128")).toBe("second");
  expect(city("10.1.0.0")).toBeNull();
  expect(city("1.2.3.4")).toBe("third");
  expect(city("1.2.3.5")).toBeNull();
  expect(city("2001:db8:0:ffff::1")).toBe("third");
  expect(city("2001:db8:1::")).toBeNull();
  const location = reader.get("10.0.1.0")?.location;
  expect([location?.latitude, location?.longitude]).toEqual([-33.5, 151]);
  // Pruning keeps exact prefixes: 10.0.1.0-10.0.2.127 is a /24 plus a /25.
  expect(reader.getWithPrefixLength("10.0.1.9")[1]).toBe(24);
  expect(reader.getWithPrefixLength("10.0.2.9")[1]).toBe(25);
});
