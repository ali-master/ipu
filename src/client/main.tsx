import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Globe2,
  LocateFixed,
  Moon,
  Search,
  Sun,
  Terminal,
  RotateCw,
  Braces,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IPInfo, LookupResult } from "../shared";

const Globe = lazy(() => import("./globe"));
const boot = document.getElementById("ipu-data")?.textContent;
const initial: LookupResult | null = boot ? JSON.parse(boot) : null;
const memory = new Map<string, { value: LookupResult; expires: number }>();
if (initial)
  memory.set(initial.data.ip, {
    value: initial,
    expires: Date.now() + 300_000,
  });

function CopyButton({
  value,
  label = "Copy",
  compact = false,
}: {
  value: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "default"}
      aria-label={copied ? "Copied" : label}
      title={error ? "Clipboard unavailable. Select and copy the text." : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setError(false);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          setError(true);
        }
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
      {!compact && (error ? "Select text to copy" : copied ? "Copied" : label)}
      <span className="sr-only" role="status">
        {copied
          ? "Copied to clipboard"
          : error
            ? "Clipboard unavailable. Select the text to copy it manually."
            : ""}
      </span>
    </Button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children ?? <span className="unavailable">Unavailable</span>}</dd>
    </div>
  );
}

function App() {
  const [result, setResult] = useState(initial);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const [viewingSelf, setViewingSelf] = useState(
    location.pathname === "/" &&
      !new URLSearchParams(location.search).has("ip"),
  );
  const controller = useRef<AbortController | null>(null);
  const data = result?.data;

  async function lookup(ip = "", force = false) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setError("");
    const cached = memory.get(ip.trim().toLowerCase());
    if (!force && cached && cached.expires > Date.now()) {
      setResult(cached.value);
      setViewingSelf(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/json${ip ? `?ip=${encodeURIComponent(ip.trim())}` : ""}`,
        { signal: active.signal, headers: { Accept: "application/json" } },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Lookup failed. Please try again.");
      const { meta, ...nextData } = payload as IPInfo & {
        meta: LookupResult["meta"];
      };
      const next = { data: nextData, meta };
      if (memory.size >= 100) memory.delete(memory.keys().next().value!);
      memory.set(nextData.ip, { value: next, expires: Date.now() + 300_000 });
      setResult(next);
      setViewingSelf(!ip);
    } catch (err) {
      if (!active.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Connection failed. Please try again.",
        );
    } finally {
      if (!active.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (!initial) void lookup();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      try {
        if (!localStorage.getItem("ipu-theme")) {
          setDark(media.matches);
          document.documentElement.classList.toggle("dark", media.matches);
        }
      } catch {}
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ipu-theme", next ? "dark" : "light");
    } catch {}
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) void lookup(query);
  };
  const json = JSON.stringify(data, null, 2);
  const endpoints = [
    ["/ip", "Your IP, nothing else"],
    ["/json", "The complete picture"],
    ["/country", "Country name"],
    ["/network", "Network CIDR"],
    ["/asn", "Autonomous system number"],
    ["/1.1.1.1", "Any IPv4 or IPv6 address"],
  ];
  return (
    <>
      <a className="skip-link" href="#lookup">
        Skip to IP lookup
      </a>
      <header className="header frame">
        <Wordmark intro />
        <span className="brand-caption">IP, meet you.</span>
        <nav aria-label="Main navigation">
          <a href="#details">Your network</a>
          <a href="#developers">
            For developers <ArrowUpRight size={14} />
          </a>
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="theme-toggle"
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </Button>
      </header>

      <main>
        <div className="connection-overview frame">
          <section className="hero" aria-labelledby="hero-heading">
            <div className="hero-copy">
              <h1 id="hero-heading">
                Your place on the internet.
              </h1>
              <p className="hero-description">
                Your IP, location, and network — already here.
              </p>
              <div className="identity" data-ui aria-busy={loading}>
                <div className="identity-label">
                  <span className="status-dot" />
                  {viewingSelf ? "Your connection" : "Address lookup"}
                  <span className="ip-version">
                    {data?.ipv6 ? "IPv6" : "IPv4"}
                  </span>
                </div>
                <div className={`ip-address ${data?.ipv6 ? "is-v6" : ""}`}>
                  <span>{data?.ip ?? "Finding you…"}</span>
                  {data && (
                    <CopyButton value={data.ip} label="Copy IP address" compact />
                  )}
                </div>
                <div className="connection-place">
                  <LocateFixed size={16} />
                  <span>
                    {data?.city
                      ? `${data.city}, ${data.country}`
                      : (data?.country ??
                        (data?.address_type !== "unicast"
                          ? "Local or reserved network"
                          : "Location unavailable"))}
                  </span>
                </div>
                <div className="identity-meta">
                  <span>
                    {data?.asn_organization ?? "Network provider unavailable"}
                  </span>
                  <span>{data?.asn ? `AS${data.asn}` : data?.address_type}</span>
                </div>
              </div>
              <div className="lookup-controls">
                <form id="lookup" className="search-form" onSubmit={submit} data-ui>
                  <label className="sr-only" htmlFor="ip-query">
                    IP address to look up
                  </label>
                  <Search size={18} className="search-icon" />
                  <Input
                    id="ip-query"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Explore any IP address"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="lookup-feedback"
                    required
                    maxLength={45}
                  />
                  <Button
                    type="submit"
                    disabled={loading}
                    className="search-button"
                  >
                    {loading ? (
                      <RotateCw className="animate-spin" size={17} />
                    ) : (
                      <ArrowRight size={20} />
                    )}
                    <span className="sr-only">Look up IP</span>
                  </Button>
                </form>
                <div className="search-options">
                  <span>
                    Try{" "}
                    <button
                      onClick={() => {
                        setQuery("1.1.1.1");
                        void lookup("1.1.1.1");
                      }}
                    >
                      1.1.1.1
                    </button>{" "}
                    or{" "}
                    <button
                      onClick={() => {
                        setQuery("8.8.8.8");
                        void lookup("8.8.8.8");
                      }}
                    >
                      8.8.8.8
                    </button>
                  </span>
                  <button
                    onClick={() => {
                      setQuery("");
                      void lookup("", true);
                    }}
                  >
                    <LocateFixed size={14} /> My IP
                  </button>
                </div>
                <p
                  id="lookup-feedback"
                  role={error ? "alert" : "status"}
                  className={error ? "feedback error" : "feedback"}
                >
                  {error ||
                    (loading
                      ? "Looking up this address…"
                      : "IPv4 + IPv6. No account. No extra steps.")}
                </p>
              </div>
            </div>

          </section>

          <section
            className="details-section"
            id="details"
            aria-labelledby="details-heading"
          >
            <Tabs defaultValue="overview">
              <div className="section-heading">
                <div>
                  <h2 id="details-heading">Behind the address.</h2>
                </div>
                <TabsList aria-label="Information format">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="json">
                    <Braces size={14} /> JSON
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="overview">
                <div className="details-grid" data-ui>
                  <article className="detail-panel location-panel">
                    <div className="panel-heading">
                      <h3>Somewhere on Earth</h3>
                      <Globe2 size={20} />
                    </div>
                    <div className="location-feature">
                      <span className="country-code">
                        {data?.country_code ?? "—"}
                      </span>
                      <div>
                        <strong>
                          {data?.city ?? data?.country ?? "Location unavailable"}
                        </strong>
                        <span>
                          {[data?.region, data?.country]
                            .filter(Boolean)
                            .join(", ") ||
                            "Local and reserved IPs have no public location."}
                        </span>
                      </div>
                    </div>
                    <dl>
                      <Row label="Continent">{data?.continent}</Row>
                      <Row label="Country">{data?.country}</Row>
                      <Row label="Region / province">{data?.region}</Row>
                      <Row label="City">{data?.city}</Row>
                      <Row label="Timezone">{data?.timezone}</Row>
                      <Row label="Coordinates">
                        {data?.latitude != null && data.longitude != null
                          ? `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`
                          : null}
                      </Row>
                      <Row label="Accuracy radius">
                        {data?.accuracy_radius != null
                          ? `${data.accuracy_radius} km`
                          : null}
                      </Row>
                    </dl>
                    <p className="panel-note">
                      An approximate location, never a street address.
                    </p>
                  </article>
                  <article className="detail-panel network-panel">
                    <div className="panel-heading">
                      <h3>Your network</h3>
                      <ArrowUpRight size={20} />
                    </div>
                    <div className="network-feature">
                      <span>Autonomous system</span>
                      <strong>
                        {data?.asn ? `AS${data.asn}` : "Unavailable"}
                      </strong>
                      <p>
                        {data?.asn_organization ??
                          "No ASN record for this address."}
                      </p>
                    </div>
                    <dl>
                      <Row label="Network CIDR">{data?.network}</Row>
                      <Row label="IP version">
                        {data ? (data.ipv6 ? "IPv6" : "IPv4") : null}
                      </Row>
                    </dl>
                  </article>
                  <article className="detail-panel traits-panel">
                    <div className="panel-heading">
                      <h3>At a glance</h3>
                      <LocateFixed size={20} />
                    </div>
                    <dl>
                      <Row label="Address type">{data?.address_type}</Row>
                      <Row label="Private address">
                        {data ? String(data.private_address) : null}
                      </Row>
                      <Row label="IPv6">{data ? String(data.ipv6) : null}</Row>
                    </dl>
                    <div className="privacy-note">
                      <span className="privacy-symbol">U</span>
                      <h4>Just the essentials.</h4>
                      <p>
                        No account. No third-party lookup requests. Your results
                        stay in temporary memory.
                      </p>
                    </div>
                  </article>
                </div>
              </TabsContent>
              <TabsContent value="json">
                <div className="json-panel" data-ui>
                  <div>
                    <span>application/json</span>
                    <CopyButton value={json ?? "{}"} label="Copy JSON" />
                  </div>
                  <pre tabIndex={0}>{json ?? "Loading…"}</pre>
                </div>
              </TabsContent>
            </Tabs>
            <div className="data-source">
              <span>
                GeoLite2 by{" "}
                <a
                  href="https://www.maxmind.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  MaxMind <ArrowUpRight size={12} />
                </a>
              </span>
              <span>
                City data: {data?.database.city ?? "—"} · ASN data:{" "}
                {data?.database.asn ?? "Unavailable"}
              </span>
              <button
                onClick={() => void lookup(viewingSelf ? "" : data?.ip, true)}
                disabled={loading}
              >
                <RotateCw size={13} /> Refresh lookup
              </button>
            </div>
          </section>

          <div className="globe-stage">
            <div className="globe-topline">
              <span>
                <Globe2 size={15} /> A world, connected.
              </span>
              <span>Live lookup</span>
            </div>
            <Suspense
              fallback={
                <div className="globe-placeholder" aria-label="Loading globe" />
              }
            >
              <Globe
                latitude={data?.latitude ?? null}
                longitude={data?.longitude ?? null}
                dark={dark}
              />
            </Suspense>
            <div className="globe-caption">
              <span className="location-marker" />
              <div>
                <strong>
                  {data?.country ?? "Every connection has a place."}
                </strong>
                <span>
                  {data?.latitude != null && data.longitude != null
                    ? `${Math.abs(data.latitude).toFixed(4)}° ${data.latitude >= 0 ? "N" : "S"} / ${Math.abs(data.longitude).toFixed(4)}° ${data.longitude >= 0 ? "E" : "W"}`
                    : "Look up a public IP to locate it."}
                </span>
              </div>
              <span className="globe-hint">Drag to explore</span>
            </div>
          </div>
        </div>

        <section
          className="developer-section"
          id="developers"
          aria-labelledby="developer-heading"
        >
          <div className="frame developer-grid">
            <div className="developer-copy">
              <Terminal size={28} />
              <h2 id="developer-heading">
                Less interface.
                <br />
                More terminal.
              </h2>
              <p>
                The same information, wherever you work. Call IPU from curl,
                wget, HTTPie, or your next little script.
              </p>
              <a href="/json" className="text-link">
                Open your JSON response <ArrowUpRight size={17} />
              </a>
              <p className="developer-note">
                No API key required. Just a request away.
              </p>
            </div>
            <div className="terminal-panel" data-ui>
              <div className="terminal-title">
                <span>
                  <Terminal size={15} /> Quick start
                </span>
                <span>HTTP · GET</span>
              </div>
              <Tabs defaultValue="curl">
                <TabsList aria-label="HTTP client">
                  <TabsTrigger value="curl">curl</TabsTrigger>
                  <TabsTrigger value="wget">wget</TabsTrigger>
                  <TabsTrigger value="httpie">HTTPie</TabsTrigger>
                </TabsList>
                {["curl", "wget", "httpie"].map((client) => {
                  const command =
                    client === "curl"
                      ? `curl ${location.origin}/json`
                      : client === "wget"
                        ? `wget -qO- ${location.origin}/json`
                        : `http ${location.origin}/json`;
                  return (
                    <TabsContent key={client} value={client}>
                      <div className="command">
                        <code>
                          <span>$ </span>
                          {command}
                        </code>
                        <CopyButton
                          value={command}
                          label="Copy command"
                          compact
                        />
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
              <div className="endpoint-list">
                {endpoints.map(([path, label]) => (
                  <a key={path} href={path} target="_blank" rel="noreferrer">
                    <code>{path}</code>
                    <span>{label}</span>
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              </div>
              <p className="terminal-note">
                Use /json?ip=1.1.1.1 for a specific address as JSON.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer frame">
        <div className="footer-brand">
          <Wordmark />
          <p>
            The internet is big.
            <br />
            This little part is you.
          </p>
        </div>
        <div>
          <span>Built for people. Ready for machines.</span>
          <p>
            IPU · U means you. <a href="#lookup">Back to your address ↑</a>
          </p>
        </div>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
