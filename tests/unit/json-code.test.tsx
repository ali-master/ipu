import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonCode } from "../../src/client/components/json-code";

test("JSON highlighting preserves escaped content, nested values and number formats", () => {
  const value = JSON.stringify(
    {
      'quoted"key': '<script>alert("x")</script> \\ path\nline',
      values: [-12.5, 1e30, 1e-8, true, false, null],
      nested: { city: "آمستردام", ip: "2606:4700::1111" },
    },
    null,
    2,
  );
  const html = renderToStaticMarkup(<JsonCode value={value} />);
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(quot|#x27|lt|gt|amp);/g,
      (_, entity: "quot" | "#x27" | "lt" | "gt" | "amp") =>
        ({ quot: '"', "#x27": "'", lt: "<", gt: ">", amp: "&" })[entity]!,
    );
  expect(text).toBe(value);
  expect(html).not.toContain("<script>");
  for (const kind of [
    "key",
    "string",
    "number",
    "boolean",
    "null",
    "punctuation",
  ]) {
    expect(html).toContain(`class="json-${kind}"`);
  }
  expect(html).toContain('aria-hidden="true" data-line="1"');
});
