# Forest Bus Registry repository rules

These rules apply to the entire repository.

## System boundary

- This repository is the only intended writer for Passenger, PublicProfile,
  PassengerPublication, Passenger images, NFC, PassengerAccess, and
  RecoveryIdentity after an explicitly approved production cutover.
- Do not add Product, Cart, Order, Payment, Shipping, price, SKU, inventory, or
  checkout models. Those belong to `forest-bus-legacy` Commerce.
- Do not add vNext UI, PassengerDesign, curation, recommendation, or generic
  future-product behavior. Those belong to `forest-bus-vnext` unless a later
  accepted architecture decision says otherwise.
- Never share a database, table, schema, object-storage write credential, or
  dual-write path with Legacy or vNext. Integrate through versioned APIs and
  events with idempotency.
- PublicProfile and Registry views are derived projections. They must not
  become a second independently writable copy of Passenger facts.
- NFC is an identity resolver, not ownership, authentication, access, or
  anti-counterfeit proof.

## Archive boundary

- Archive export is a strict, sanitized, deterministic public projection.
- Never include PassengerAccess, RecoveryIdentity, customer/account data,
  secrets or hashes, internal IDs, Commerce data, raw NFC payloads, tag UIDs,
  operator data, or private events in an Archive Bundle.
- A synthetic contract test passing does not authorize production export,
  migration, deployment, DNS, or route cutover.

## Development

- Use Node.js 24 and the exact pnpm version pinned in `package.json`.
- Keep dependencies directed from adapters/interfaces to application to domain
  modules. Domain modules must not import adapters, interfaces, sibling
  repositories, AWS SDKs, or vendor infrastructure.
- New write commands must define idempotency, optimistic concurrency, audit,
  and transaction/outbox behavior before production use.
- Run `pnpm check` for repository-only verification and
  `pnpm check:workspace` when the sibling Archive consumer is available.

## GitHub access

- Do not invoke `gh` for any purpose.
- Use SSH only for Git transport. Use the GitHub REST API for all other GitHub
  operations and follow the workspace secret-handling policy in the parent
  `AGENTS.md`.
