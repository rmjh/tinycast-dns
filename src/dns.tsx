import { LaunchProps } from "@raycast/api";
import { parseLaunchText } from "./api";
import { DnsView } from "./dns-view";
import { DomainPrompt, WhoisDetail } from "./whois-view";

// As a fallback command Raycast passes the whole root search text, so "whois example.com" works here too.
export default function Command(props: LaunchProps) {
  const { kind, domain } = parseLaunchText(props.fallbackText ?? "", "dns");
  if (!domain) return <DomainPrompt kind="dns" />;
  return kind === "dns" ? <DnsView domain={domain} /> : <WhoisDetail domain={domain} />;
}
