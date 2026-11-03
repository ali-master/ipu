import { expect, test, type Page } from "@playwright/test";

test.use({
  launchOptions: { args: ["--enable-experimental-web-platform-features"] },
});

async function invoke(page: Page, name: string, input: object = {}) {
  return page.evaluate(
    async ({ name, input }) => {
      const context = document.modelContext!;
      const tool = (await context.getTools()).find(
        (tool) => tool.name === name,
      )!;
      const output = await context.executeTool(tool, input);
      return {
        result: JSON.parse(output),
        length: output.length,
        ip: document.querySelector(".ip-address > span")?.textContent,
        path: location.pathname,
      };
    },
    { name, input },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/88.198.53.22");
  await page.waitForFunction(
    async () => (await document.modelContext?.getTools())?.length === 2,
  );
});

test("native WebMCP discovery, current result and IPv4/IPv6 lookup agree with the committed UI", async ({
  page,
}) => {
  const tools = await page.evaluate(async () =>
    (await document.modelContext!.getTools()).map(
      ({ name, description, annotations }) => ({
        name,
        description,
        annotations,
      }),
    ),
  );
  expect(tools.map((tool) => tool.name)).toEqual([
    "get_current_result",
    "lookup_ip",
  ]);
  expect(tools[0]!.annotations?.readOnlyHint).toBe(true);
  expect(tools[1]!.annotations?.readOnlyHint).toBe(false);
  for (const tool of tools) {
    expect(tool.name.length).toBeLessThanOrEqual(30);
    expect(tool.description.length).toBeLessThanOrEqual(500);
    expect(tool.annotations?.untrustedContentHint).toBe(true);
    expect(tool.annotations?.consequentialHint).toBe(false);
  }
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/json") requests++;
  });
  const current = await invoke(page, "get_current_result");
  expect(current.result.data.ip).toBe("88.198.53.22");
  expect(requests).toBe(0);
  for (const [input, expected] of [
    [" ::ffff:8.8.8.8 ", "8.8.8.8"],
    ["2606:4700:4700::1111", "2606:4700:4700::1111"],
    ["127.0.0.1", "127.0.0.1"],
  ]) {
    const output = await invoke(page, "lookup_ip", { ip: input });
    expect(output.result.ok).toBe(true);
    expect(output.result.data.ip).toBe(expected);
    expect(output.result.connection).toBe(false);
    expect(output.ip).toBe(expected);
    expect(output.path).toBe(`/${expected}`);
    expect(output.length).toBeLessThanOrEqual(1500);
    await expect(page.getByLabel("IP address to look up")).toHaveValue(
      expected!,
    );
  }
  const beforeCache = requests;
  await invoke(page, "lookup_ip", { ip: "8.8.8.8" });
  expect(requests).toBe(beforeCache);
  const self = await invoke(page, "lookup_ip");
  expect(self.result.connection).toBe(true);
  expect(self.result.data.ip).toBe(
    (await (await page.request.get("/ip")).text()).trim(),
  );
  expect(self.path).toBe("/");
  await page.goto("/docs");
  expect(
    await page.evaluate(
      async () => (await document.modelContext!.getTools()).length,
    ),
  ).toBe(0);
});

test("invalid addresses and failed requests return errors without replacing the result", async ({
  page,
}) => {
  for (const ip of ["127.1", "https://1.1.1.1", "fe80::1%en0", "1.1.1.1/24"]) {
    const output = await invoke(page, "lookup_ip", { ip });
    expect(output.result.error.code).toBe("invalid_ip");
    expect(output.ip).toBe("88.198.53.22");
    expect(output.path).toBe("/88.198.53.22");
  }
  await page.route("**/json?ip=8.8.8.8", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Lookup temporarily unavailable" }),
    }),
  );
  const failed = await invoke(page, "lookup_ip", { ip: "8.8.8.8" });
  expect(failed.result.ok).toBe(false);
  expect(failed.result.error.code).toBe("lookup_failed");
  expect(failed.ip).toBe("88.198.53.22");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  expect((await invoke(page, "get_current_result")).result.data.ip).toBe(
    "88.198.53.22",
  );
});

test("native cancellation leaves the previous UI intact", async ({ page }) => {
  await page.route("**/json?ip=8.8.8.8", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response }).catch(() => {});
  });
  const cancelled = await page.evaluate(async () => {
    const context = document.modelContext!;
    const tool = (await context.getTools()).find(
      (tool) => tool.name === "lookup_ip",
    )!;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    try {
      await context.executeTool(
        tool,
        { ip: "8.8.8.8" },
        { signal: controller.signal },
      );
      return false;
    } catch (error) {
      return error instanceof DOMException && error.name === "AbortError";
    }
  });
  expect(cancelled).toBe(true);
  await expect
    .poll(async () => (await invoke(page, "get_current_result")).result.ok)
    .toBe(true);
  await expect(page).toHaveURL("/88.198.53.22");
  await expect(page.locator(".ip-address")).toContainText("88.198.53.22");
  await expect(page.getByRole("alert")).toBeHidden();
});

test("a newer user lookup supersedes a pending agent lookup", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/json?ip=8.8.8.8", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  const started = page.waitForRequest("**/json?ip=8.8.8.8");
  const pending = invoke(page, "lookup_ip", { ip: "8.8.8.8" });
  await started;
  expect((await invoke(page, "get_current_result")).result.error.code).toBe(
    "busy",
  );
  await page.getByRole("button", { name: "My IP", exact: true }).click();
  const cancelled = await pending;
  expect(cancelled.result.error.code).toBe("cancelled");
  release();
  await expect(page).toHaveURL("/");
  await expect
    .poll(
      async () => (await invoke(page, "get_current_result")).result.connection,
    )
    .toBe(true);
});

test("registration failure removes native tools and leaves manual lookup usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const context = document.modelContext!;
    const original = context.registerTool.bind(context);
    context.registerTool = async (
      tool: WebMCP.ModelContextTool,
      options?: WebMCP.ModelContextRegisterToolOptions,
    ) => {
      if (tool.name === "get_current_result")
        throw new Error("Simulated registration failure");
      return original(tool, options);
    };
  });
  const warning = page.waitForEvent(
    "console",
    (message) =>
      message.type() === "warning" &&
      message.text().includes("IPU WebMCP registration unavailable"),
  );
  await page.reload();
  await warning;
  expect(
    await page.evaluate(
      async () => (await document.modelContext!.getTools()).length,
    ),
  ).toBe(0);
  await page.getByLabel("IP address to look up").fill("8.8.8.8");
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
  await expect(page).toHaveURL("/8.8.8.8");
  await expect(page.locator(".ip-address")).toContainText("8.8.8.8");
  expect(errors).toEqual([]);
});
