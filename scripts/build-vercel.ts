import { open } from "maxmind";

export async function prepareDatabase(
  path: string,
  source: string | undefined,
  type: "City" | "ASN",
) {
  if (!(await Bun.file(path).exists())) {
    if (!source) {
      if (type === "ASN") return;
      throw new Error(
        "Set MAXMIND_CITY_DB_URL to a direct HTTPS MMDB download URL in Vercel.",
      );
    }
    const url = new URL(source);
    if (url.protocol !== "https:")
      throw new Error("Database downloads require HTTPS.");
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new Error(`${type} database download failed (${response.status}).`);
    await Bun.write(path, response);
  }
  const reader = await open(path);
  if (!reader.metadata.databaseType.includes(type))
    throw new Error(`Expected a ${type} MMDB database at ${path}.`);
}

if (import.meta.main) {
  const cityPath =
    Bun.env.MAXMIND_CITY_DB || "assets/GeoLite2-City-2026-06-05.mmdb";
  const asnPath = Bun.env.MAXMIND_ASN_DB || "assets/GeoLite2-ASN.mmdb";
  for (const path of [cityPath, asnPath]) {
    if (!/^assets\/[^/\\]+\.mmdb$/.test(path))
      throw new Error(
        "Vercel database paths must be .mmdb files directly inside assets/.",
      );
  }
  await prepareDatabase(cityPath, Bun.env.MAXMIND_CITY_DB_URL, "City");
  await prepareDatabase(asnPath, Bun.env.MAXMIND_ASN_DB_URL, "ASN");
  await import("./build");
  const manifest: { path: string }[] =
    await Bun.file("dist/manifest.json").json();
  for (const { path } of manifest) {
    if (!path.endsWith(".html"))
      await Bun.write(`public/${path}`, Bun.file(`dist/${path}`));
  }
}
