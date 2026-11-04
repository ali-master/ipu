import { expect, test } from "bun:test";
import { resolveSiteURL } from "../../src/config";

test("site origins normalize trailing slashes, casing and local ports", () => {
  expect(resolveSiteURL("https://IPU.example/")).toBe("https://ipu.example");
  expect(resolveSiteURL("http://localhost:3300")).toBe("http://localhost:3300");
});

test("invalid site origins fail instead of producing broken discovery links", () => {
  for (const value of [
    "",
    "ipu.example",
    "javascript:alert(1)",
    "ftp://ipu.example",
    "https://user:password@ipu.example",
    "https://ipu.example/app",
    "https://ipu.example/?q=test",
    "https://ipu.example/#fragment",
    "https://a&b.example",
    "https://a'b.example",
  ])
    expect(() => resolveSiteURL(value)).toThrow("SITE_URL");
});
