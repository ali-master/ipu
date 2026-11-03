import type { LookupResult } from "../shared";

export type LookupOutcome =
  | { ok: true; result: LookupResult; self: boolean }
  | { ok: false; error: { code: string; message: string } };

export function lookupError(code: string, message: string): LookupOutcome {
  return { ok: false, error: { code, message } };
}

export async function registerIPUTools(
  context: Pick<WebMCP.ModelContext, "registerTool">,
  actions: {
    lookup: (ip: string, signal: AbortSignal) => Promise<LookupOutcome>;
    current: () => LookupOutcome;
  },
  lifetime: AbortSignal,
) {
  const rollback = new AbortController();
  const signal = AbortSignal.any([lifetime, rollback.signal]);
  let ready = false;
  const tools: WebMCP.ModelContextTool[] = [
    {
      name: "lookup_ip",
      title: "Look up an IP address",
      description:
        "Look up IPv4 or IPv6 network, ASN and approximate location and show it on this page. Omit ip for this browser's connection, including any VPN or proxy. Updates the search field, results, globe and URL. Missing location fields are null.",
      inputSchema: {
        type: "object",
        properties: {
          ip: {
            type: "string",
            description:
              "IPv4 or IPv6 address, with optional surrounding spaces. Omit to look up this browser's connection.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        consequentialHint: false,
        untrustedContentHint: true,
      },
      execute: async (input, options) => {
        if (
          Object.hasOwn(input, "ip") &&
          (typeof input.ip !== "string" || !input.ip.trim())
        )
          return lookupError(
            "invalid_ip",
            "Provide a valid IPv4 or IPv6 address, or omit ip for this browser's connection.",
          );
        return actions.lookup(
          typeof input.ip === "string" ? input.ip : "",
          options.signal,
        );
      },
    },
    {
      name: "get_current_result",
      title: "Read the displayed IP result",
      description:
        "Read the latest completed IP result displayed on this page without a network request or page change. Returns a busy error during a lookup. The result can be an explicitly searched address; the connection field identifies whether it represents this browser.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        consequentialHint: false,
        untrustedContentHint: true,
      },
      execute: () => actions.current(),
    },
  ];
  try {
    await Promise.all(
      tools.map((tool) =>
        context.registerTool(
          {
            ...tool,
            execute: async (input, options) => {
              const execution = AbortSignal.any([signal, options.signal]);
              execution.throwIfAborted();
              if (!ready)
                return JSON.stringify(
                  lookupError(
                    "not_ready",
                    "IPU tools are still registering. Retry shortly.",
                  ),
                );
              const allowed = tool.name === "lookup_ip" ? ["ip"] : [];
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).some((key) => !allowed.includes(key))
              )
                return JSON.stringify(
                  lookupError(
                    "invalid_arguments",
                    `Expected an object with ${allowed.length ? "only an optional ip field" : "no fields"}.`,
                  ),
                );
              const outcome = (await tool.execute(input, {
                signal: execution,
              })) as LookupOutcome;
              return JSON.stringify(
                outcome.ok
                  ? {
                      ok: true,
                      connection: outcome.self,
                      location_is_approximate: true,
                      data: outcome.result.data,
                      meta: outcome.result.meta,
                    }
                  : outcome,
              );
            },
          },
          { signal },
        ),
      ),
    );
    signal.throwIfAborted();
    ready = true;
  } catch (error) {
    rollback.abort();
    throw error;
  }
}
