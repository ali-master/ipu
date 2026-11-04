import { createLookup } from "./lookup";
import { createApp } from "./app";
import { createClientResolver } from "./client-ip";

export async function createServer(
  clientIP?: (request: Request) => string | null,
) {
  const { lookup } = await createLookup();
  const manifestFile = Bun.file("dist/manifest.json");
  if (!(await manifestFile.exists()))
    throw new Error("Run bun run build before starting IPU.");
  const manifest: { path: string; type: string }[] = await manifestFile.json();
  const assets = new Map<string, { body: Blob; gzip: Blob }>();
  for (const item of manifest) {
    if (!item.path.endsWith(".html")) {
      const bytes = await Bun.file(`dist/${item.path}`).arrayBuffer();
      assets.set(`/${item.path}`, {
        body: new Blob([bytes], { type: item.type }),
        gzip: new Blob([new Uint8Array(Bun.gzipSync(bytes))]),
      });
    }
  }
  const resolve = createClientResolver(Bun.env.TRUSTED_PROXIES);
  const app = createApp({
    lookup,
    html: await Bun.file("dist/index.html").text(),
    assets,
    originTrialToken: Bun.env.WEBMCP_ORIGIN_TRIAL_TOKEN,
    clientIP:
      clientIP ??
      ((request) =>
        resolve(request, app.server?.requestIP(request)?.address ?? null)),
  });
  return app;
}
