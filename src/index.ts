import { createServer } from "./runtime";

async function start() {
  if (Bun.argv.includes("--healthcheck")) {
    const response = await fetch(
      `http://127.0.0.1:${Bun.env.PORT ?? 3000}/health`,
      { signal: AbortSignal.timeout(2000) },
    );
    process.exit(response.ok ? 0 : 1);
  }
  const app = await createServer();
  app.listen({
    port: Number(Bun.env.PORT ?? 3000),
    hostname: Bun.env.HOST ?? "0.0.0.0",
  });
  console.log(`IPU is listening at http://localhost:${app.server?.port}`);
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
