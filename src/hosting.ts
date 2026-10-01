import { promises as dns } from "node:dns";
import { DnsResponse } from "./types";

// The who.is API has no hosting summary like the website's "Hosting & Network" panel,
// so derive one from the records it does return, plus an ASN lookup.

type Pattern = [RegExp, string];

const DNS_PROVIDERS: Pattern[] = [
  [/wixdns\.net/, "Wix"],
  [/cloudflare\.com/, "Cloudflare"],
  [/awsdns/, "Amazon Route 53"],
  [/googledomains\.com|\.google\.com$/, "Google Cloud DNS"],
  [/azure-dns/, "Azure DNS"],
  [/domaincontrol\.com/, "GoDaddy"],
  [/registrar-servers\.com/, "Namecheap"],
  [/nsone\.net/, "NS1"],
  [/dnsimple/, "DNSimple"],
  [/digitalocean\.com/, "DigitalOcean"],
  [/squarespacedns\.com|squarespace\.com/, "Squarespace"],
  [/shopify\.com/, "Shopify"],
  [/vercel-dns\.com/, "Vercel"],
  [/netlify/, "Netlify"],
  [/ultradns/, "UltraDNS"],
  [/akam\.net|akamai/, "Akamai"],
  [/dynect\.net/, "Oracle Dyn"],
  [/hostgator|websitewelcome/, "HostGator"],
  [/bluehost/, "Bluehost"],
  [/siteground/, "SiteGround"],
  [/hover\.com/, "Hover"],
  [/gandi\.net/, "Gandi"],
  [/porkbun/, "Porkbun"],
  [/name-services\.com/, "Enom"],
  [/worldnic\.com/, "Network Solutions"],
  [/ionos|ui-dns/, "IONOS"],
  [/ovh\.net/, "OVHcloud"],
  [/hetzner/, "Hetzner"],
  [/linode/, "Linode"],
  [/dnsmadeeasy/, "DNS Made Easy"],
];

const EMAIL_PROVIDERS: Pattern[] = [
  [/google\.com|googlemail\.com/, "Google Workspace"],
  [/outlook\.com|office365|microsoft/, "Microsoft 365"],
  [/zoho\./, "Zoho Mail"],
  [/protonmail|proton\.me/, "Proton Mail"],
  [/messagingengine\.com|fastmail/, "Fastmail"],
  [/icloud\.com|me\.com/, "iCloud Mail"],
  [/pphosted\.com|ppe-hosted/, "Proofpoint"],
  [/mimecast/, "Mimecast"],
  [/barracudanetworks/, "Barracuda"],
  [/secureserver\.net/, "GoDaddy"],
  [/mailgun/, "Mailgun"],
  [/sendgrid/, "SendGrid"],
  [/amazonaws\.com/, "Amazon SES"],
  [/yandex/, "Yandex Mail"],
  [/titan\.email/, "Titan"],
  [/mxroute/, "MXroute"],
  [/improvmx/, "ImprovMX"],
  [/forwardemail/, "Forward Email"],
  [/registrar-servers\.com|privateemail/, "Namecheap"],
];

// For platforms that hand customers a CNAME target.
const PLATFORM_CNAMES: Pattern[] = [
  [/wixdns\.net/, "Wix"],
  [/myshopify\.com|shopify/, "Shopify"],
  [/squarespace/, "Squarespace"],
  [/netlify/, "Netlify"],
  [/vercel/, "Vercel"],
  [/github\.io/, "GitHub Pages"],
  [/herokudns|herokuapp/, "Heroku"],
  [/wpengine/, "WP Engine"],
  [/kinsta/, "Kinsta"],
  [/pantheon/, "Pantheon"],
  [/cloudfront\.net/, "Amazon CloudFront"],
  [/azurewebsites|azureedge/, "Azure"],
  [/webflow/, "Webflow"],
  [/ghost\.io/, "Ghost"],
  [/hubspot/, "HubSpot"],
  [/wordpress\.com/, "WordPress.com"],
  [/framer/, "Framer"],
  [/fly\.dev/, "Fly.io"],
  [/render\.com/, "Render"],
];

export type HostingSummary = {
  platform?: string;
  managedDns?: string;
  email?: string;
  ipv6: boolean;
  caa: string[];
  ip?: string;
};

export type AsnInfo = { asn: string; name: string; prefix: string; country: string };

function match(values: string[], patterns: Pattern[]): string | undefined {
  const found = new Set<string>();
  for (const v of values) {
    const lower = v.toLowerCase();
    for (const [re, name] of patterns) if (re.test(lower)) found.add(name);
  }
  return found.size ? [...found].join(", ") : undefined;
}

// "10 aspmx.l.google.com." → "aspmx.l.google.com"
const lastToken = (v: string) => v.trim().split(/\s+/).pop()!.replace(/\.$/, "");

export function summarizeHosting(data: DnsResponse): HostingSummary {
  const apex = data.hostnames.find((h) => h.hostname === data.domain) ?? data.hostnames[0];
  const www = data.hostnames.find((h) => h.hostname === `www.${data.domain}`);
  const all = (type: string) => data.hostnames.flatMap((h) => h.records[type] ?? []);
  const apexRecords = (type: string) => apex?.records[type] ?? [];

  const cnames = [...(www?.records.CNAME ?? []), ...apexRecords("CNAME")].map(lastToken);
  const platform = apex?.provider_name ?? www?.provider_name ?? match(cnames, PLATFORM_CNAMES) ?? undefined;

  // CAA values look like: 0 issue "letsencrypt.org"
  const caa = [
    ...new Set(
      all("CAA")
        .filter((v) => /\bissue(wild)?\b/i.test(v))
        .map((v) => v.match(/"([^";]*)/)?.[1] ?? "")
        .filter(Boolean),
    ),
  ];

  return {
    platform,
    managedDns: match(apexRecords("NS").map(lastToken), DNS_PROVIDERS),
    email: match(apexRecords("MX").map(lastToken), EMAIL_PROVIDERS) ?? (apexRecords("MX").length ? "Other" : undefined),
    ipv6: all("AAAA").length > 0,
    caa,
    ip: apexRecords("A")[0] ?? (www?.records.A ?? [])[0],
  };
}

// Team Cymru's free IP-to-ASN service, queried over plain DNS.
export async function lookupAsn(ip: string): Promise<AsnInfo | undefined> {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return undefined;
  const reversed = ip.split(".").reverse().join(".");
  const [origin] = await dns.resolveTxt(`${reversed}.origin.asn.cymru.com`);
  if (!origin) return undefined;
  // "58182 | 185.230.63.0/24 | IL | ripencc | 2017-11-06"
  const [asn, prefix, country] = origin
    .join("")
    .split("|")
    .map((s) => s.trim());
  const [details] = await dns.resolveTxt(`AS${asn.split(" ")[0]}.asn.cymru.com`);
  // "58182 | IL | ripencc | 2017-11-08 | wix_com - Wix.com Ltd., IL"
  const rawName = details?.join("").split("|")[4]?.trim() ?? "";
  const name = rawName.replace(/^[^-]*-\s*/, "").replace(/,\s*[A-Z]{2}$/, "") || rawName;
  return { asn: `AS${asn.split(" ")[0]}`, name, prefix, country };
}
