import tailwind from "bun-plugin-tailwind";
import { metadata } from "../src/discovery";
const result = await Bun.build({
  entrypoints: ["src/client/index.html"],
  outdir: "dist",
  target: "browser",
  minify: true,
  splitting: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
});
if (!result.success)
  throw new AggregateError(result.logs, "Frontend build failed");
const html = Bun.file("dist/index.html");
await Bun.write(
  html,
  (await html.text()).replace("<!-- IPU_METADATA -->", metadata()),
);
const brand = ["logo.svg", "social-preview.png"];
for (const name of brand)
  await Bun.write(`dist/${name}`, Bun.file(`assets/${name}`));
await Bun.write(
  "dist/manifest.json",
  JSON.stringify([
    ...result.outputs.map((file) => ({
      path: file.path.split("/dist/")[1],
      type: file.type,
    })),
    ...brand.map((name) => ({
      path: name,
      type: Bun.file(`assets/${name}`).type,
    })),
  ]),
);
console.log(`Built ${result.outputs.length} assets with Bun.`);
