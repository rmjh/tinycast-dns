# Tinycast DNS

A Raycast extension for WHOIS and DNS lookups using the [who.is API](https://who.is/docs/api).

## Setup

1. `npm install && npm run dev`
2. Enter your who.is API key when prompted (create one at [who.is/account/api](https://who.is/account/api)).
3. To type `whois example.com` or `dns example.com` straight into Raycast, add **WHOIS** as your top fallback command.

## Usage

- `whois example.com`: WHOIS record
- `dns example.com`: DNS records with a hosting summary
- ⌘D switches between the two
