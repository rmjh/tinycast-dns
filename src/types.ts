export type Event = { event_action: string; event_date: string };
export type Contact = Partial<
  Record<
    | "name"
    | "organization"
    | "address1"
    | "address2"
    | "city"
    | "state_province"
    | "postal_code"
    | "country"
    | "phone"
    | "fax"
    | "email",
    string
  >
>;

export type WhoisResponse = {
  domain: string;
  registrar: string | null;
  whois_server: string | null;
  referral_url: string | null;
  statuses: string[];
  snapshot_time: string;
  events: Event[];
  nameservers: { ldh_name: string }[];
  contacts: Record<string, Contact>;
};

export type DnsHostname = {
  hostname: string;
  hosting_class: string;
  provider_name: string | null;
  first_seen: string;
  last_seen: string;
  records: Record<string, string[]>;
};

export type DnsResponse = {
  domain: string;
  hostnames: DnsHostname[];
  snapshot_time: string;
};
