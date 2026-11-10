/**
 * Builds IPU's own IP databases from the public ip-location-db release
 * (https://github.com/sapics/ip-location-db/releases/tag/latest):
 *
 *   bun scripts/build-ip-db.ts   # -> assets/ipu-city.mmdb + assets/ipu-asn.mmdb
 *
 * Every source is layered by priority into one tree per database, so a lookup
 * gets the most detailed answer any source has. Records follow the GeoLite2
 * City / ASN shapes, so the app reads them through MAXMIND_CITY_DB and
 * MAXMIND_ASN_DB without code changes. Downloads are cached in .cache/ and
 * verified against the SHA-256 digests GitHub reports for the release; reruns
 * fetch only what changed upstream.
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Reader } from "maxmind";

const RELEASE =
  "https://api.github.com/repos/sapics/ip-location-db/releases/tags/latest";
const CACHE = ".cache/ip-location-db";

// Highest priority first; a later source only adds what earlier ones lack.
const GEO_SOURCES = [
  "geolite2-city", // most accurate country/region, city where confident
  "dbip-city", // a city for nearly every range GeoLite2 leaves at country level
];
// ponytail: the release's country-only files (user-, server-, iptoasn-country)
// are left out; measured on 2026-11-10 they cover no address these two miss.
const ASN_SOURCES = ["geolite2-asn", "origin-asn", "dbip-asn", "iptoasn-asn"];
const ATTRIBUTION =
  "Merged from github.com/sapics/ip-location-db. This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com. IP geolocation by DB-IP (https://db-ip.com), CC BY 4.0.";

// ───────────────────────────── MMDB writer ─────────────────────────────

/** Unsigned integer with an explicit MMDB type (5 = uint16, 6 = uint32, 9 = uint64). */
class UInt {
  constructor(
    readonly type: 5 | 6 | 9,
    readonly value: number,
  ) {}
}

function head(type: number, size: number): number[] {
  const ext = type > 7 ? [type - 7] : [];
  const tag = type > 7 ? 0 : type << 5;
  if (size < 29) return [tag | size, ...ext];
  if (size < 285) return [tag | 29, ...ext, size - 29];
  size -= 285;
  if (size < 65536) return [tag | 30, ...ext, size >> 8, size & 255];
  throw new Error("MMDB value too large.");
}

function pointer(p: number): number[] {
  if (p < 2048) return [0x20 | (p >> 8), p & 255];
  if (p < 526336) {
    p -= 2048;
    return [0x28 | (p >> 16), (p >> 8) & 255, p & 255];
  }
  if (p < 134744064) {
    p -= 526336;
    return [0x30 | (p >> 24), (p >> 16) & 255, (p >> 8) & 255, p & 255];
  }
  return [0x38, p >>> 24, (p >> 16) & 255, (p >> 8) & 255, p & 255];
}

/** MMDB data section. Repeated strings, maps and arrays are stored once and shared by pointer. */
class Encoder {
  private bytes = new Uint8Array(1 << 16);
  private seen = new Map<string, number>();
  length = 0;
  constructor(private share: boolean) {}

  /** Stores `value` as a standalone item (once) and returns its offset. */
  put(value: unknown): number {
    const key = JSON.stringify(value);
    let offset = this.seen.get(key);
    if (offset === undefined) {
      const item = this.item(value); // stores shared children first
      if (this.length + item.length > this.bytes.length) {
        const grown = new Uint8Array(this.bytes.length * 2 + item.length);
        grown.set(this.bytes);
        this.bytes = grown;
      }
      offset = this.length;
      this.bytes.set(item, offset);
      this.length += item.length;
      this.seen.set(key, offset);
    }
    return offset;
  }

  result() {
    return this.bytes.subarray(0, this.length);
  }

  private child(value: unknown): number[] {
    const inline =
      !this.share ||
      typeof value === "number" ||
      value instanceof UInt ||
      (typeof value === "string" && value.length < 4);
    return inline ? this.item(value) : pointer(this.put(value));
  }

  private item(value: unknown): number[] {
    if (typeof value === "string") {
      const utf8 = new TextEncoder().encode(value);
      return [...head(2, utf8.length), ...utf8];
    }
    if (typeof value === "number") {
      const double = new DataView(new ArrayBuffer(8));
      double.setFloat64(0, value);
      return [...head(3, 8), ...new Uint8Array(double.buffer)];
    }
    if (value instanceof UInt) {
      const digits: number[] = [];
      for (let v = value.value; v > 0; v = Math.floor(v / 256))
        digits.unshift(v % 256);
      return [...head(value.type, digits.length), ...digits];
    }
    if (Array.isArray(value))
      return [
        ...head(11, value.length),
        ...value.flatMap((v) => this.child(v)),
      ];
    const entries = Object.entries(value as object);
    return [
      ...head(7, entries.length),
      ...entries.flatMap(([k, v]) => [...this.child(k), ...this.child(v)]),
    ];
  }
}

const bit = (address: Uint8Array, depth: number) =>
  (address[depth >> 3] >> (7 - (depth & 7))) & 1;

/** Number of trailing bits of a 16-byte address that equal `fill` (0 or 255 per byte). */
function trailing(address: Uint8Array, fill: 0 | 255) {
  let i = 15;
  while (i >= 0 && address[i] === fill) i--;
  if (i < 0) return 128;
  let count = (15 - i) * 8;
  for (let x = address[i] ^ fill; !(x & 1); x >>= 1) count++;
  return count;
}

/**
 * Binary trie over 128-bit addresses (IPv4 lives at ::/96, where MMDB readers
 * look for it). Ranges may overlap: `merge(old, id)` decides what a leaf keeps
 * (`old` is -1 for an empty leaf).
 */
export class Trie {
  // Two slots per node: 0 = empty, > 0 = child node, < 0 = ~recordId.
  private slots = new Int32Array(1 << 16);
  private nodes = 1;
  // The range being inserted, and how many trailing 0 / 1 bits its ends have.
  private start: Uint8Array = new Uint8Array(16);
  private end: Uint8Array = new Uint8Array(16);
  private zeros = 0;
  private ones = 0;
  constructor(private merge: (old: number, id: number) => number) {}

  /** Applies record `id` to every address in the inclusive range [start, end]. */
  insert(start: Uint8Array, end: Uint8Array, id: number) {
    this.start = start;
    this.end = end;
    this.zeros = trailing(start, 0);
    this.ones = trailing(end, 255);
    this.walk(0, 0, true, true, id);
  }

  // Segment-tree descent: `lo`/`hi` say whether this node still sits on the
  // range's lower/upper boundary. A child is taken whole once it is clear of
  // both boundaries (or the boundary's remaining bits are all 0s / all 1s).
  private walk(
    node: number,
    depth: number,
    lo: boolean,
    hi: boolean,
    id: number,
  ) {
    const first = lo ? bit(this.start, depth) : 0;
    const last = hi ? bit(this.end, depth) : 1;
    const rest = 127 - depth;
    for (let side = first; side <= last; side++) {
      const l = lo && side === first;
      const h = hi && side === last;
      const slot = node * 2 + side;
      if ((!l || rest <= this.zeros) && (!h || rest <= this.ones))
        this.fill(slot, id);
      else {
        const next = this.descend(slot, id);
        if (next) this.walk(next, depth + 1, l, h, id);
      }
    }
  }

  private fill(slot: number, id: number) {
    const child = this.slots[slot];
    if (child > 0) {
      this.fill(child * 2, id);
      this.fill(child * 2 + 1, id);
    } else this.slots[slot] = ~this.merge(~child, id);
  }

  /** Child node under `slot`, splitting a leaf when needed; 0 when `id` would change nothing below. */
  private descend(slot: number, id: number) {
    const child = this.slots[slot];
    if (child > 0) return child;
    if (child < 0 && this.merge(~child, id) === ~child) return 0;
    if (this.nodes * 2 === this.slots.length) {
      const grown = new Int32Array(this.slots.length * 2);
      grown.set(this.slots);
      this.slots = grown;
    }
    const node = this.nodes++;
    this.slots[node * 2] = this.slots[node * 2 + 1] = child;
    return (this.slots[slot] = node);
  }

  /** Collapses nodes whose two halves ended up identical. */
  private prune(slot: number): number {
    const node = this.slots[slot];
    if (node <= 0) return node;
    const left = this.prune(node * 2);
    const right = this.prune(node * 2 + 1);
    return left <= 0 && left === right ? (this.slots[slot] = left) : node;
  }

  /** Serializes to MMDB 2.0; `value(id)` is the record stored for a leaf. */
  toMMDB(
    type: string,
    description: string,
    value: (id: number) => unknown,
  ): Uint8Array {
    this.prune(0);
    this.prune(1);

    // Number the surviving nodes breadth-first from the root.
    const order = new Int32Array(this.nodes);
    const index = new Int32Array(this.nodes);
    const data = new Encoder(true);
    const offsets = new Map<number, number>();
    let count = 1;
    for (let i = 0; i < count; i++)
      for (let side = 0; side < 2; side++) {
        const child = this.slots[order[i] * 2 + side];
        if (child > 0) {
          index[child] = count;
          order[count++] = child;
        } else if (child < 0 && !offsets.has(~child))
          offsets.set(~child, data.put(value(~child)));
      }

    const limit = count + 16 + data.length;
    const bits = limit < 2 ** 24 ? 24 : limit < 2 ** 28 ? 28 : 32;
    if (limit >= 2 ** 32) throw new Error("Database too large for MMDB.");
    const tree = new Uint8Array((count * bits) / 4);
    // A record points at a node, at "no data" (= count), or into the data section.
    const record = (slot: number) => {
      const child = this.slots[slot];
      if (child > 0) return index[child];
      return child === 0 ? count : count + 16 + offsets.get(~child)!;
    };
    for (let i = 0; i < count; i++) {
      const l = record(order[i] * 2);
      const r = record(order[i] * 2 + 1);
      // Uint8Array.set keeps the low byte of each value.
      tree.set(
        bits === 24
          ? [l >> 16, l >> 8, l, r >> 16, r >> 8, r]
          : bits === 28
            ? [
                l >> 16,
                l >> 8,
                l,
                ((l >> 24) << 4) | (r >> 24),
                r >> 16,
                r >> 8,
                r,
              ]
            : [l >>> 24, l >> 16, l >> 8, l, r >>> 24, r >> 16, r >> 8, r],
        (i * bits) / 4,
      );
    }

    const metadata = new Encoder(false);
    metadata.put({
      binary_format_major_version: new UInt(5, 2),
      binary_format_minor_version: new UInt(5, 0),
      build_epoch: new UInt(9, Math.floor(Date.now() / 1000)),
      database_type: type,
      description: { en: description },
      ip_version: new UInt(5, 6),
      languages: ["en"],
      node_count: new UInt(6, count),
      record_size: new UInt(5, bits),
    });
    return Buffer.concat([
      tree,
      new Uint8Array(16),
      data.result(),
      Buffer.from("\xab\xcd\xefMaxMind.com", "latin1"),
      metadata.result(),
    ]);
  }
}

// ───────────────────────────── Source files ─────────────────────────────

/** Parses dotted IPv4 or colon IPv6 text into 16 bytes (IPv4 at ::/96). */
// ponytail: hand-rolled because ipaddr.js is ~20x slower across ~40M parses.
export function parseIP(text: string, out: Uint8Array) {
  out.fill(0);
  if (!text.includes(":")) {
    const parts = text.split(".");
    for (let i = 0; i < 4; i++) out[12 + i] = Number(parts[i]);
    if (parts.length !== 4 || parts.some((p) => !(Number(p) <= 255)))
      throw new Error(`Bad IPv4 address in source data: ${text}`);
    return;
  }
  const [left, right] = text.split("::") as [string, string?];
  const headParts = left ? left.split(":") : [];
  const tailParts = right ? right.split(":") : [];
  const groups = [
    ...headParts,
    ...Array(8 - headParts.length - tailParts.length).fill("0"),
    ...tailParts,
  ];
  if (groups.length !== 8 || (right === undefined && headParts.length !== 8))
    throw new Error(`Bad IPv6 address in source data: ${text}`);
  for (let i = 0; i < 8; i++) {
    const group = parseInt(groups[i], 16);
    if (!(group <= 0xffff))
      throw new Error(`Bad IPv6 address in source data: ${text}`);
    out[i * 2] = group >> 8;
    out[i * 2 + 1] = group & 255;
  }
}

function csv(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (line[i + 1] === '"') field += line[i++];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      fields.push(field);
      field = "";
    } else field += c;
  }
  return [...fields, field];
}

async function sha256(path: string) {
  if (!existsSync(path)) return null;
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

type Asset = { name: string; digest: string; browser_download_url: string };

/**
 * The release's assets by file name. GitHub's own SHA-256 `digest` is the
 * integrity reference: the project's separate "checksum" release lags behind
 * for the monthly DB-IP files.
 */
async function releaseAssets() {
  const token = Bun.env.GITHUB_TOKEN;
  const response = await fetch(RELEASE, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok)
    throw new Error(
      `GitHub release lookup failed (${response.status}). If rate-limited, set GITHUB_TOKEN.`,
    );
  const { assets } = (await response.json()) as { assets: Asset[] };
  return new Map(assets.map((asset) => [asset.name, asset]));
}

/** Downloads one release asset into the cache (resumable, checksum-verified). */
async function download(asset: Asset): Promise<string> {
  const { name } = asset;
  const path = `${CACHE}/${name}`;
  const part = `${path}.part`;
  const expected = asset.digest.replace("sha256:", "");
  if ((await sha256(path)) === expected) return path;
  for (let attempt = 1; ; attempt++) {
    try {
      const have = existsSync(part) ? statSync(part).size : 0;
      const response = await fetch(asset.browser_download_url, {
        headers: have ? { Range: `bytes=${have}-` } : {},
      });
      // 416: the partial file is already complete (or stale; the checksum decides).
      if (response.status !== 416) {
        if (!response.ok || !response.body)
          throw new Error(`HTTP ${response.status}`);
        await pipeline(
          Readable.fromWeb(response.body as never),
          createWriteStream(part, {
            flags: response.status === 206 ? "a" : "w",
          }),
        );
      }
      if ((await sha256(part)) !== expected) {
        await rm(part, { force: true });
        throw new Error("checksum mismatch");
      }
      await rename(part, path);
      console.log(`  downloaded ${name}`);
      return path;
    } catch (error) {
      if (attempt === 8)
        throw new Error(
          `Download of ${name} failed: ${error}. If upstream just published an update, run again.`,
        );
    }
  }
}

async function* readLines(path: string) {
  let stream: ReadableStream<Uint8Array> = Bun.file(path).stream();
  if (path.endsWith(".gz"))
    stream = stream.pipeThrough(new DecompressionStream("gzip") as never);
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop()!;
    yield lines;
  }
  yield [rest];
}

type Sample = [ip: string, id: number];

/**
 * Feeds one source file into the trie. `record` turns the columns after the
 * IP range into a record id (-1 skips the row). Returns evenly spaced sample
 * rows for the post-build check.
 */
async function load(
  trie: Trie,
  path: string,
  record: (fields: string[]) => number,
): Promise<Sample[]> {
  const ids = new Map<string, number>();
  const samples: Sample[] = [];
  const start = new Uint8Array(16);
  const end = new Uint8Array(16);
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ipv6 = name.includes("ipv6");
  let rows = 0;
  for await (const lines of readLines(path))
    for (const line of lines) {
      if (!line) continue;
      const a = line.indexOf(",");
      const b = line.indexOf(",", a + 1);
      const rest = line.slice(b + 1).trimEnd();
      let id = ids.get(rest);
      if (id === undefined) ids.set(rest, (id = record(csv(rest))));
      if (id < 0) continue;
      parseIP(line.slice(0, a), start);
      parseIP(line.slice(a + 1, b), end);
      // ::/96 belongs to the IPv4 files.
      if (ipv6 && start.subarray(0, 12).every((byte) => byte === 0)) continue;
      trie.insert(start, end, id);
      if (rows++ % 1000 === 0) samples.push([line.slice(0, a), id]);
    }
  console.log(`  merged ${name} (${rows} ranges)`);
  return samples;
}

// ───────────────────────────── Databases ─────────────────────────────

// continent -> [name, "CC:Country|..."]. English names as GeoLite2 spells them;
// embedded so builds don't depend on the ICU data of whoever runs the script.
const CONTINENTS: Record<string, [name: string, countries: string]> = {
  AF: [
    "Africa",
    "AO:Angola|BF:Burkina Faso|BI:Burundi|BJ:Benin|BW:Botswana|CD:Congo (DRC)|CF:Central African Republic|CG:Congo Republic|CI:Ivory Coast|CM:Cameroon|CV:Cabo Verde|DJ:Djibouti|DZ:Algeria|EG:Egypt|EH:Western Sahara|ER:Eritrea|ET:Ethiopia|GA:Gabon|GH:Ghana|GM:Gambia|GN:Guinea|GQ:Equatorial Guinea|GW:Guinea-Bissau|KE:Kenya|KM:Comoros|LR:Liberia|LS:Lesotho|LY:Libya|MA:Morocco|MG:Madagascar|ML:Mali|MR:Mauritania|MU:Mauritius|MW:Malawi|MZ:Mozambique|NA:Namibia|NE:Niger|NG:Nigeria|RE:Réunion|RW:Rwanda|SC:Seychelles|SD:Sudan|SH:Saint Helena|SL:Sierra Leone|SN:Senegal|SO:Somalia|SS:South Sudan|ST:São Tomé and Príncipe|SZ:Eswatini|TD:Chad|TG:Togo|TN:Tunisia|TZ:Tanzania|UG:Uganda|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe",
  ],
  AN: [
    "Antarctica",
    "AQ:Antarctica|BV:Bouvet Island|GS:South Georgia and the South Sandwich Islands|HM:Heard and McDonald Islands|TF:French Southern Territories",
  ],
  AS: [
    "Asia",
    "AE:United Arab Emirates|AF:Afghanistan|AM:Armenia|AZ:Azerbaijan|BD:Bangladesh|BH:Bahrain|BN:Brunei|BT:Bhutan|CC:Cocos (Keeling) Islands|CN:China|CX:Christmas Island|GE:Georgia|HK:Hong Kong|ID:Indonesia|IL:Israel|IN:India|IO:British Indian Ocean Territory|IQ:Iraq|IR:Iran|JO:Jordan|JP:Japan|KG:Kyrgyzstan|KH:Cambodia|KP:North Korea|KR:South Korea|KW:Kuwait|KZ:Kazakhstan|LA:Laos|LB:Lebanon|LK:Sri Lanka|MM:Myanmar|MN:Mongolia|MO:Macao|MV:Maldives|MY:Malaysia|NP:Nepal|OM:Oman|PH:Philippines|PK:Pakistan|PS:Palestine|QA:Qatar|SA:Saudi Arabia|SG:Singapore|SY:Syria|TH:Thailand|TJ:Tajikistan|TM:Turkmenistan|TR:Türkiye|TW:Taiwan|UZ:Uzbekistan|VN:Vietnam|YE:Yemen",
  ],
  EU: [
    "Europe",
    "AD:Andorra|AL:Albania|AT:Austria|AX:Åland Islands|BA:Bosnia and Herzegovina|BE:Belgium|BG:Bulgaria|BY:Belarus|CH:Switzerland|CY:Cyprus|CZ:Czechia|DE:Germany|DK:Denmark|EE:Estonia|ES:Spain|FI:Finland|FO:Faroe Islands|FR:France|GB:United Kingdom|GG:Guernsey|GI:Gibraltar|GR:Greece|HR:Croatia|HU:Hungary|IE:Ireland|IM:Isle of Man|IS:Iceland|IT:Italy|JE:Jersey|LI:Liechtenstein|LT:Lithuania|LU:Luxembourg|LV:Latvia|MC:Monaco|MD:Moldova|ME:Montenegro|MK:North Macedonia|MT:Malta|NL:The Netherlands|NO:Norway|PL:Poland|PT:Portugal|RO:Romania|RS:Serbia|RU:Russia|SE:Sweden|SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SM:San Marino|UA:Ukraine|VA:Vatican City|XK:Kosovo",
  ],
  NA: [
    "North America",
    "AG:Antigua and Barbuda|AI:Anguilla|AW:Aruba|BB:Barbados|BL:Saint Barthélemy|BM:Bermuda|BQ:Bonaire, Sint Eustatius and Saba|BS:Bahamas|BZ:Belize|CA:Canada|CR:Costa Rica|CU:Cuba|CW:Curaçao|DM:Dominica|DO:Dominican Republic|GD:Grenada|GL:Greenland|GP:Guadeloupe|GT:Guatemala|HN:Honduras|HT:Haiti|JM:Jamaica|KN:Saint Kitts and Nevis|KY:Cayman Islands|LC:Saint Lucia|MF:Saint Martin|MQ:Martinique|MS:Montserrat|MX:Mexico|NI:Nicaragua|PA:Panama|PM:Saint Pierre and Miquelon|PR:Puerto Rico|SV:El Salvador|SX:Sint Maarten|TC:Turks and Caicos Islands|TT:Trinidad and Tobago|US:United States|VC:Saint Vincent and the Grenadines|VG:British Virgin Islands|VI:U.S. Virgin Islands",
  ],
  OC: [
    "Oceania",
    "AS:American Samoa|AU:Australia|CK:Cook Islands|FJ:Fiji|FM:Federated States of Micronesia|GU:Guam|KI:Kiribati|MH:Marshall Islands|MP:Northern Mariana Islands|NC:New Caledonia|NF:Norfolk Island|NR:Nauru|NU:Niue|NZ:New Zealand|PF:French Polynesia|PG:Papua New Guinea|PN:Pitcairn Islands|PW:Palau|SB:Solomon Islands|TK:Tokelau|TL:Timor-Leste|TO:Tonga|TV:Tuvalu|UM:United States Minor Outlying Islands|VU:Vanuatu|WF:Wallis and Futuna|WS:Samoa",
  ],
  SA: [
    "South America",
    "AR:Argentina|BO:Bolivia|BR:Brazil|CL:Chile|CO:Colombia|EC:Ecuador|FK:Falkland Islands|GF:French Guiana|GY:Guyana|PE:Peru|PY:Paraguay|SR:Suriname|UY:Uruguay|VE:Venezuela",
  ],
};
// country code -> the continent and country parts of its records
const countries = new Map(
  Object.entries(CONTINENTS).flatMap(([code, [continent, list]]) =>
    list.split("|").map((entry) => {
      const [iso_code, name] = entry.split(":") as [string, string];
      return [
        iso_code,
        {
          continent: { code, names: { en: continent } },
          country: { iso_code, names: { en: name } },
        },
      ] as const;
    }),
  ),
);

export async function buildCity(files: Map<string, string>) {
  // [country, state1, state2, city, postcode, latitude, longitude, timezone]
  const places: string[][] = [];
  const placeIds = new Map<string, number>();
  const intern = (place: string[]) => {
    if (!countries.has(place[0])) return -1; // unknown or non-country code
    const key = place.join("\t");
    let id = placeIds.get(key);
    if (id === undefined) placeIds.set(key, (id = places.push(place) - 1));
    return id;
  };

  // DB-IP rows carry no timezone, so learn it from GeoLite2: per city, then
  // per region or country when every GeoLite2 row there agrees ("" = they don't).
  const zones = new Map<string, string>();
  const learn = (key: string, zone: string) =>
    zones.set(key, (zones.get(key) ?? zone) === zone ? zone : "");

  const merged = new Map<number, number>();
  const trie = new Trie((old, id) => {
    if (old < 0) return id;
    const key = old * 2 ** 24 + id;
    let result = merged.get(key);
    if (result === undefined) {
      const [a, b] = [places[old], places[id]];
      // Take the newcomer's city only when it refines, not contradicts, what we have.
      const refines =
        !a[3] && b[3] && a[0] === b[0] && (!a[1] || a[1] === b[1]);
      merged.set(key, (result = refines ? id : old));
    }
    return result;
  });

  let samples: Sample[] = [];
  for (const source of GEO_SOURCES)
    for (const version of ["ipv4", "ipv6"]) {
      const rows = await load(
        trie,
        files.get(`${source}-${version}`)!,
        (fields) => {
          if (fields.length !== 8)
            throw new Error(`Unexpected ${source} row: ${fields}`);
          const [country, state, , city, , , , zone] = fields;
          if (zone) {
            if (city) learn(`${country}|${state}|${city}`, zone);
            if (state) learn(`${country}|${state}`, zone);
            learn(country, zone);
          } else {
            // DB-IP adds a district: "Austin (Las Cimas Office Park)".
            const base = city.replace(/ \(.*\)$/, "");
            fields[7] =
              zones.get(`${country}|${state}|${base}`) ||
              zones.get(`${country}|${state}`) ||
              zones.get(country) ||
              "";
          }
          return intern(fields);
        },
      );
      if (source === GEO_SOURCES[0]) samples = samples.concat(rows);
    }

  const bytes = trie.toMMDB(
    "IPU-City",
    `IPU City (${GEO_SOURCES.join(" + ")}). ${ATTRIBUTION}`,
    (id) => {
      const [country, state1, state2, city, postcode, lat, lon, zone] =
        places[id];
      return {
        ...countries.get(country),
        ...(state1 && {
          subdivisions: [state1, state2]
            .filter(Boolean)
            .map((name) => ({ names: { en: name } })),
        }),
        ...(city && { city: { names: { en: city } } }),
        ...(postcode && { postal: { code: postcode } }),
        ...((lat || zone) && {
          location: {
            ...(lat && { latitude: Number(lat), longitude: Number(lon) }),
            ...(zone && { time_zone: zone }),
          },
        }),
      };
    },
  );
  verify(bytes, samples, (found, id) => {
    const record = found as { country?: { iso_code?: string } } | null;
    return record?.country?.iso_code === places[id][0];
  });
  return bytes;
}

export async function buildASN(files: Map<string, string>) {
  const owners: [number: number, organization: string][] = [];
  const ownerIds = new Map<string, number>();
  // Best-known name per ASN, for rows (mostly origin-asn) that come without one.
  const organizations = new Map<number, string>();
  const trie = new Trie((old, id) => (old < 0 ? id : old));
  let samples: Sample[] = [];
  for (const source of ASN_SOURCES)
    for (const version of ["ipv4", "ipv6"]) {
      const rows = await load(
        trie,
        files.get(`${source}-${version}`)!,
        ([number, organization = ""]) => {
          if (!(Number(number) > 0)) return -1;
          if (organization && !organizations.has(Number(number)))
            organizations.set(Number(number), organization);
          const key = `${number}\t${organization}`;
          let id = ownerIds.get(key);
          if (id === undefined)
            ownerIds.set(
              key,
              (id = owners.push([Number(number), organization]) - 1),
            );
          return id;
        },
      );
      if (source === ASN_SOURCES[0]) samples = samples.concat(rows);
    }
  const bytes = trie.toMMDB(
    "IPU-ASN",
    `IPU ASN (${ASN_SOURCES.join(" + ")}). ${ATTRIBUTION}`,
    (id) => {
      const [number, organization] = owners[id];
      const name = organization || organizations.get(number);
      return {
        autonomous_system_number: new UInt(6, number),
        ...(name && { autonomous_system_organization: name }),
      };
    },
  );
  verify(bytes, samples, (found, id) => {
    const record = found as { autonomous_system_number?: number } | null;
    return record?.autonomous_system_number === owners[id][0];
  });
  return bytes;
}

/** Reads the finished file back and checks sampled rows of the top-priority source. */
function verify(
  bytes: Uint8Array,
  samples: Sample[],
  matches: (found: unknown, id: number) => boolean,
) {
  const reader = new Reader(Buffer.from(bytes));
  const bad = samples.filter(([ip, id]) => !matches(reader.get(ip), id));
  if (!samples.length || bad.length)
    throw new Error(
      `Built database failed read-back for ${bad.length}/${samples.length} sampled ranges (first: ${bad[0]?.[0]}).`,
    );
  console.log(
    `  verified ${samples.length} sampled ranges, ${(bytes.length / 1e6).toFixed(1)} MB`,
  );
}

if (import.meta.main) {
  const started = performance.now();
  mkdirSync(CACHE, { recursive: true });
  const names = [...GEO_SOURCES, ...ASN_SOURCES].flatMap((source) =>
    ["ipv4", "ipv6"].map((version) => `${source}-${version}`),
  );
  console.log(`Fetching ${names.length} source files into ${CACHE}/ ...`);
  const assets = await releaseAssets();
  const files = new Map<string, string>();
  const queue = [...names];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let name; (name = queue.shift());) {
        const file = `${name}.csv${name.includes("-city-") ? ".gz" : ""}`;
        const asset = assets.get(file);
        if (!asset?.digest)
          throw new Error(`Release has no usable asset named ${file}.`);
        files.set(name, await download(asset));
      }
    }),
  );
  console.log("Building assets/ipu-city.mmdb ...");
  await Bun.write("assets/ipu-city.mmdb", await buildCity(files));
  console.log("Building assets/ipu-asn.mmdb ...");
  await Bun.write("assets/ipu-asn.mmdb", await buildASN(files));
  console.log(
    `Done in ${((performance.now() - started) / 1000).toFixed(0)}s. Use them with:\n  MAXMIND_CITY_DB=assets/ipu-city.mmdb MAXMIND_ASN_DB=assets/ipu-asn.mmdb bun start`,
  );
}
