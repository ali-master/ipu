import { expect, test } from "@playwright/test";

test("lookup URLs follow successful results, cache, history and reload", async ({ page }) => {
  const original = "88.198.53.22";
  const ipv6 = "2a09:bac5:4e3b:2705::3e3:24";
  await page.goto(`/${original}#developers`);
  await page.getByLabel("IP address to look up").fill(ipv6);
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page).toHaveURL(`/${ipv6}`);
  await expect(page.locator(".ip-address")).toContainText(ipv6);
  await page.goBack();
  await expect(page).toHaveURL(`/${original}#developers`);
  await expect(page.locator(".ip-address")).toContainText(original);
  await page.goForward();
  await expect(page).toHaveURL(`/${ipv6}`);
  await expect(page.locator(".ip-address")).toContainText(ipv6);
  await page.reload();
  await expect(page.locator(".ip-address")).toContainText(ipv6);
  await page.getByLabel("IP address to look up").fill("invalid");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(`/${ipv6}`);
  await page.getByRole("button", { name: "My IP", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".identity-label")).toContainText("Your connection");
  await page.getByRole("button", { name: "1.1.1.1", exact: true }).click();
  await expect(page).toHaveURL("/1.1.1.1");
});

test("IP text fits one line after lookup and live viewport changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/2a09:bac5:4e3b:2705::3e3:24");
  await page.evaluate(() => document.fonts.ready);
  const address = page.locator(".ip-address > span");
  for (const ip of ["2a09:bac5:4e3b:2705::3e3:24", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "88.198.53.22"]) {
    await page.getByLabel("IP address to look up").fill(ip);
    await page.getByRole("button", { name: "Look up IP", exact: true }).click();
    await expect(address).toHaveText(ip);
    for (const width of [1877, 1101, 768, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => address.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        const copy = element.parentElement!.querySelector("button")!.getBoundingClientRect();
        return range.getClientRects().length === 1 &&
          text.width <= box.width + .5 && text.right < copy.left &&
          document.documentElement.scrollWidth <= innerWidth;
      })).toBe(true);
    }
  }
});

test("logo motion replays without layout shifts and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/88.198.53.22");
  const logo = page.locator(".header .wordmark");
  const active = () => logo.evaluate((element) =>
    element.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
  );
  await expect.poll(active).toBe(6);
  await page.evaluate(() => document.fonts.ready);
  const bounds = await logo.boundingBox();
  await expect.poll(active).toBe(0);
  await logo.hover();
  await expect.poll(active).toBe(6);
  expect(await logo.boundingBox()).toEqual(bounds);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(active).toBe(0);
  await logo.focus();
  expect(await active()).toBe(0);
  await page.reload();
  await expect(logo).toBeVisible();
  expect(await active()).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await logo.focus();
  await expect.poll(active).toBe(6);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logo.click();
  await expect(page).toHaveURL("/");
});

test("boot data, theme, live lookup, JSON, clipboard and browser cache", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/json")) apiCalls.push(request.url());
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/88.198.53.22");
  await expect(page.locator(".ip-address")).toContainText("88.198.53.22");
  expect(apiCalls).toHaveLength(0);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      document.fonts.check('16px "Work Sans Variable"'),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Copy IP address", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "88.198.53.22",
  );
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByLabel("IP address to look up").fill("1.1.1.1");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.locator(".ip-address")).toContainText("1.1.1.1");
  await expect(page.locator(".network-feature")).toContainText("AS13335");
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.locator(".json-panel pre")).toContainText(
    '"ip": "1.1.1.1"',
  );
  await page.getByRole("button", { name: "Copy JSON", exact: true }).click();
  expect(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).asn,
  ).toBe(13335);
  await page.getByLabel("IP address to look up").fill("88.198.53.22");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.locator(".ip-address")).toContainText("88.198.53.22");
  expect(apiCalls).toHaveLength(1);
  await page.getByRole("tab", { name: "wget", exact: true }).click();
  await expect(page.locator(".command")).toContainText("wget -qO-");
  await page.getByRole("tab", { name: "HTTPie", exact: true }).click();
  await expect(page.locator(".command")).toContainText("http http://");
  expect(errors).toEqual([]);
});

test("validation errors preserve the last successful result and can recover", async ({
  page,
}) => {
  await page.goto("/88.198.53.22");
  await page.getByLabel("IP address to look up").fill("not-an-ip");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid IPv4 or IPv6");
  await expect(page.locator(".ip-address")).toContainText("88.198.53.22");
  await page.getByLabel("IP address to look up").fill("2606:4700:4700::1111");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.locator(".ip-address")).toContainText(
    "2606:4700:4700::1111",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "My IP", exact: true }).click();
  await expect(page.locator(".identity-label")).toContainText(
    "Your connection",
  );
  await expect(page.locator(".connection-place")).toContainText(
    "Local or reserved network",
  );
});

test("failed network request leaves data intact and retry works", async ({
  page,
}) => {
  await page.goto("/88.198.53.22");
  await page.route("**/json?ip=*", (route) => route.abort());
  await page.getByLabel("IP address to look up").fill("8.8.8.8");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".ip-address")).toContainText("88.198.53.22");
  await page.unroute("**/json?ip=*");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page.locator(".ip-address")).toContainText("8.8.8.8");
});

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: readable layout, complete fields and reduced motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/88.198.53.22");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".location-panel")).toContainText(
        "50.477700, 12.364900",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const lines = await page
        .locator("h1")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().height /
            parseFloat(getComputedStyle(element).lineHeight),
        );
      expect(lines).toBeLessThanOrEqual(2.1);
      await expect(
        page.getByRole("button", { name: "Look up IP", exact: true }),
      ).toBeInViewport();
      await expect(page.locator(".location-panel .panel-heading")).toBeInViewport();
      if (width >= 1100) {
        for (const panel of await page.locator(".detail-panel").all()) {
          await expect(panel).toBeInViewport({ ratio: 1 });
        }
      }
      await page.locator("canvas").waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: `.taste-skill/final-${width}-${theme}.png`,
        fullPage: true,
      });
      await page
        .getByLabel("IP address to look up")
        .fill("2606:4700:4700::1111");
      await page
        .getByRole("button", { name: "Look up IP", exact: true })
        .click();
      await expect(page.locator(".ip-address")).toContainText(
        "2606:4700:4700::1111",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}

test("HTML without JavaScript retains usable lookup links and form", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3011/");
  await expect(
    page.getByRole("heading", { name: "IPU — IP, meet you." }),
  ).toBeVisible();
  await page.getByLabel("Look up an IP address").fill("1.1.1.1");
  await page.getByRole("button", { name: "Look up", exact: true }).click();
  await expect(page.locator("body")).toContainText('"ip":"1.1.1.1"');
  await context.close();
});
