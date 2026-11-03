import tailwind from "bun-plugin-tailwind";
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
await Bun.write(
  "dist/manifest.json",
  JSON.stringify(
    result.outputs.map((file) => ({
      path: file.path.split("/dist/")[1],
      type: file.type,
    })),
  ),
);
console.log(`Built ${result.outputs.length} assets with Bun.`);
