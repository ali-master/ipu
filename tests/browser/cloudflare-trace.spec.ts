import { expect, test } from "@playwright/test";

const endpoint = "https://cloudflare.com/cdn-cgi/trace";
const body =
  "ip=203.0.113.42\ncolo=FRA\nloc=DE\nhttp=http/2\ntls=TLSv1.3\nwarp=off\nuag=Browser a=b\n";

test("trace runs in the browser, stays independent of searches and fits both themes", async ({
  page,
}, info) => {
  let requests = 0;
  await page.route(endpoint, async (route) => {
    requests++;
    expect(route.request().headers().referer).toBeUndefined();
    await route.fulfill({
      body,
      contentType: "text/plain",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  const response = await page.goto("/1.1.1.1");
  expect(response?.headers()["content-security-policy"]).toContain(
    `connect-src 'self' ${endpoint};`,
  );
  const panel = page.getByRole("region", { name: "Cloudflare trace" });
  await expect(panel).toContainText("203.0.113.42");
  await expect(
    panel.getByRole("button", { name: "Refresh trace" }),
  ).toBeEnabled();
  await page.getByLabel("IP address to look up").fill("8.8.8.8");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page).toHaveURL("/8.8.8.8");
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(panel).toContainText("203.0.113.42");
  expect(requests).toBe(1);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await panel.getByText("Full trace", { exact: false }).click();
  await expect(panel.locator("pre")).toContainText("Browser a=b");
  for (const [width, dark] of [
    [390, false],
    [768, false],
    [1440, true],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark,
    );
    await panel.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({ path: info.outputPath(`trace-${width}.png`) });
  }
  await panel.getByRole("button", { name: "Refresh trace" }).click();
  await expect.poll(() => requests).toBe(2);
});

test("trace failure and retry do not block lookup; failed refresh keeps prior data", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(endpoint, async (route) => {
    attempts++;
    if (attempts === 1) return route.abort();
    await route.fulfill({
      body: attempts === 2 ? body : "<html>Challenge</html>",
      contentType: "text/plain",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.goto("/1.1.1.1");
  const panel = page.getByRole("region", { name: "Cloudflare trace" });
  await expect(panel.getByRole("status")).toContainText("unavailable");
  await expect(page.locator(".ip-address")).toContainText("1.1.1.1");
  await panel.getByRole("button", { name: "Retry trace" }).click();
  await expect(panel).toContainText("203.0.113.42");
  await panel.getByRole("button", { name: "Refresh trace" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Showing the previous trace",
  );
  await expect(panel).toContainText("203.0.113.42");
});
