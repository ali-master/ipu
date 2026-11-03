import { expect, test, type Page } from "@playwright/test";

async function expectPaintedGlobe(page: Page) {
  const png = await page.locator(".globe-canvas").screenshot();
  const colors = await page.evaluate(async (image) => {
    const bitmap = await createImageBitmap(
      new Blob(
        [Uint8Array.from(atob(image), (character) => character.charCodeAt(0))],
        { type: "image/png" },
      ),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const unique = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4)
      unique.add(
        (pixels[index]! << 16) | (pixels[index + 1]! << 8) | pixels[index + 2]!,
      );
    bitmap.close();
    return unique.size;
  }, png.toString("base64"));
  // A visible canvas can still be a completely blank WebGL frame.
  expect(colors).toBeGreaterThan(80);
}

async function lookup(page: Page, ip: string) {
  await page.getByLabel("IP address to look up").fill(ip);
  await page.getByRole("button", { name: "Look up IP", exact: true }).click();
}

test("globe stays painted through local, missing-location, invalid and repeated theme changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/88.198.53.22");
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "located",
  );
  await expectPaintedGlobe(page);
  for (const ip of ["127.0.0.1", "::1", "1.1.1.1"]) {
    await lookup(page, ip);
    await expect(page).toHaveURL(`/${ip}`);
    await expect(page.locator(".globe-surface")).toHaveAttribute(
      "data-phase",
      "exploring",
    );
    await expect(page.locator(".globe-beacon")).toHaveCSS(
      "visibility",
      "hidden",
    );
    await expectPaintedGlobe(page);
  }
  await lookup(page, "invalid");
  await expect(page.getByRole("alert")).toBeVisible();
  await expectPaintedGlobe(page);
  for (let index = 0; index < 4; index++) {
    await page.getByRole("button", { name: /Switch to .* theme/ }).click();
    await lookup(page, index % 2 ? "127.0.0.1" : "8.8.8.8");
    await expect(page.locator(".globe-surface")).toHaveAttribute(
      "data-phase",
      index % 2 ? "exploring" : "located",
    );
    await expectPaintedGlobe(page);
  }
  expect(errors).toEqual([]);
});

test("location arrival animates, settles on the point and honors reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/127.0.0.1");
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "exploring",
  );
  await lookup(page, "88.198.53.22");
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "locating",
  );
  await expect
    .poll(() =>
      page
        .locator(".globe-beacon")
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    )
    .toBe(2);
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "located",
  );
  await expectPaintedGlobe(page);
  expect(
    await page.locator(".globe-beacon").evaluate((element) => {
      const point = element.getBoundingClientRect();
      const globe = element.parentElement!.getBoundingClientRect();
      return Math.hypot(
        point.x - globe.x - globe.width / 2,
        point.y - globe.y - globe.height / 2,
      );
    }),
  ).toBeLessThan(1);
  await expect
    .poll(() =>
      page
        .locator(".globe-beacon")
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await lookup(page, "8.8.8.8");
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "locating",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "located",
  );
  expect(
    await page
      .locator(".globe-beacon")
      .evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await expectPaintedGlobe(page);
});

test("WebGL loss shows a globe fallback and restores rendering", async ({
  page,
}) => {
  await page.goto("/127.0.0.1");
  await expect(page.locator(".globe-surface")).toHaveAttribute(
    "data-phase",
    "exploring",
  );
  await page.locator("canvas").evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    element.addEventListener(
      "webglcontextlost",
      () => setTimeout(() => extension.restoreContext(), 500),
      { once: true },
    );
    extension.loseContext();
  });
  await expect(page.locator(".globe-fallback")).toBeVisible();
  await expect(page.locator(".globe-fallback")).toBeHidden();
  await expectPaintedGlobe(page);
});
