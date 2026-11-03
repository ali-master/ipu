import { expect, test } from "bun:test";
import { registerIPUTools, lookupError } from "../../src/client/webmcp";

test("tool registration rolls back the whole batch if any registration fails", async () => {
  const registered = new Map<string, WebMCP.ModelContextTool>();
  const context = {
    async registerTool(
      tool: WebMCP.ModelContextTool,
      options?: WebMCP.ModelContextRegisterToolOptions,
    ) {
      if (tool.name === "get_current_result")
        throw new Error("Registration denied");
      registered.set(tool.name, tool);
      options!.signal!.addEventListener(
        "abort",
        () => registered.delete(tool.name),
        { once: true },
      );
    },
  };
  await expect(
    registerIPUTools(
      context,
      {
        lookup: async () => {
          throw new Error("Must not execute");
        },
        current: () => {
          throw new Error("Must not execute");
        },
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow("Registration denied");
  expect(registered.size).toBe(0);
});

test("partial registration, runtime input validation and stale calls cannot invoke application actions", async () => {
  const registered = new Map<string, WebMCP.ModelContextTool>();
  const gate = Promise.withResolvers<void>();
  const lifetime = new AbortController();
  let calls = 0;
  const registering = registerIPUTools(
    {
      async registerTool(
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions,
      ) {
        registered.set(tool.name, tool);
        options!.signal!.addEventListener(
          "abort",
          () => registered.delete(tool.name),
          { once: true },
        );
        await gate.promise;
      },
    },
    {
      lookup: async () => {
        calls++;
        return lookupError("no_result", "No result");
      },
      current: () => {
        calls++;
        return lookupError("no_result", "No result");
      },
    },
    lifetime.signal,
  );
  const tool = registered.get("lookup_ip")!;
  const execute = (input: unknown) =>
    tool.execute(input as Record<string, unknown>, {
      signal: new AbortController().signal,
    });
  expect(JSON.parse((await execute({})) as string).error.code).toBe(
    "not_ready",
  );
  gate.resolve();
  await registering;
  for (const input of [
    null,
    [],
    "8.8.8.8",
    { ip: null },
    { ip: 123 },
    { ip: "" },
    { ip: "  " },
    { url: "https://example.com" },
  ]) {
    expect(JSON.parse((await execute(input)) as string).ok).toBe(false);
  }
  expect(calls).toBe(0);
  await execute({ ip: "8.8.8.8" });
  expect(calls).toBe(1);
  lifetime.abort();
  expect(registered.size).toBe(0);
  await expect(execute({})).rejects.toThrow();
  expect(calls).toBe(1);
});
