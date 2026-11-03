import { createLookup } from "./lookup";
import { createApp } from "./app";
import { createClientResolver } from "./client-ip";

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
  clientIP: (request) =>
    resolve(request, app.server?.requestIP(request)?.address ?? null),
});
app.listen({
  port: Number(Bun.env.PORT ?? 3000),
  hostname: Bun.env.HOST ?? "0.0.0.0",
});
console.log(`IPU is listening at http://localhost:${app.server?.port}`);
