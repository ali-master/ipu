import { expect, test } from "bun:test";
import { parseTrace } from "../../src/client/cloudflare-trace";

test("trace parser preserves values, IPv6 and unknown fields", () => {
  expect(
    parseTrace(
      "ip=2606:4700::1111\r\ncolo=FRA\r\nuag=Agent a=b\r\nfuture=value\r\n",
    ),
  ).toEqual({
    ip: "2606:4700::1111",
    colo: "FRA",
    uag: "Agent a=b",
    future: "value",
  });
});

test("trace parser rejects challenge pages, missing fields, duplicates and oversized responses", () => {
  for (const body of [
    "<html>Challenge</html>",
    "",
    "ip=invalid\ncolo=FRA",
    "ip=1.1.1.1",
    "ip=1.1.1.1\ncolo=FRA\ncolo=AMS",
    "ip=1.1.1.1\ncolo=FRA\n__proto__=bad",
    "x".repeat(65_537),
  ])
    expect(() => parseTrace(body)).toThrow();
});
