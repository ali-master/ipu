import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { JsonCode } from "./json-code";
import { parseTrace, traceURL } from "../cloudflare-trace";

const summary = [
  ["ip", "Your IP at Cloudflare"],
  ["colo", "Data center"],
  ["loc", "Country code"],
  ["http", "HTTP"],
  ["tls", "TLS"],
  ["warp", "WARP"],
] as const;

export function CloudflareTrace() {
  const [trace, setTrace] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function refresh() {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(traceURL, {
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error("Cloudflare trace failed.");
      const result = parseTrace(await response.text());
      if (!active.signal.aborted) {
        setTrace(result);
        setCheckedAt(Date.now());
      }
    } catch {
      if (!active.signal.aborted) setError(true);
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, []);

  return (
    <section className="trace-panel" aria-labelledby="trace-heading" data-ui>
      <div className="trace-heading">
        <div>
          <h3 id="trace-heading">Cloudflare trace</h3>
          <p>
            Your browser → Cloudflare. Always your connection, independent of
            the IP search.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RotateCw size={15} aria-hidden="true" />
          {loading ? "Connecting…" : error ? "Retry trace" : "Refresh trace"}
        </Button>
      </div>
      <p className="trace-status" role="status">
        {error
          ? trace
            ? "Could not refresh Cloudflare. Showing the previous trace."
            : "Cloudflare trace is unavailable on this connection. You can retry."
          : loading
            ? "Checking your connection to Cloudflare…"
            : checkedAt
              ? `Checked at ${new Date(checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              : ""}
      </p>
      <dl className="trace-grid" aria-busy={loading}>
        {summary.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd className={loading && !trace ? "trace-loading" : undefined}>
              {trace?.[key] || "—"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="trace-full-slot">
        {trace && (
          <details className="trace-full">
            <summary>
              Full trace <span>{Object.keys(trace).length} fields</span>
            </summary>
            <div className="json-panel">
              <JsonCode value={JSON.stringify(trace, null, 2)} />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
