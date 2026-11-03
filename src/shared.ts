export interface IPInfo {
  ip: string;
  network: string | null;
  network_source: "asn" | "city" | null;
  continent: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_radius: number | null;
  asn: number | null;
  asn_organization: string | null;
  private_address: boolean;
  ipv6: boolean;
  address_type: string;
  database: { city: string; asn: string | null };
}
export interface LookupResult {
  data: IPInfo;
  meta: { cached: boolean; lookup_ms: number };
}
