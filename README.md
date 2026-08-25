# Forest Bus Registry

`forest-bus-registry` is the target single source of truth for long-lived
Passenger identity and access facts. This initialization establishes the
boundary and a runnable vertical skeleton; it has **not** taken production
write ownership from Legacy and nothing is deployed.

## Repository ownership

| Repository            | Final responsibility                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `forest-bus-registry` | Passenger, PublicProfile, Passenger Publication, Passenger images, NFC, PassengerAccess, RecoveryIdentity |
| `forest-bus-legacy`   | Product, Cart, Order, Payment, Shipping                                                                   |
| `forest-bus-vnext`    | Future product experience and its own experience-specific capabilities                                    |
| `forest-bus-archive`  | Final public, read-only snapshot                                                                          |

The important invariant is one writer per fact:

```text
Legacy Commerce ── stable passengerId / API / events ──┐
                                                       v
vNext experience ─── commands / queries / projections ─> Registry
                                                       │
                                                       └── sanitized offline Bundle ──> Archive
```

Legacy and vNext must never share Registry tables, storage write credentials,
or a runtime dual-write path. A cache or search index outside Registry must be
discardable and cannot make authoritative decisions.

## What is initialized

- strict TypeScript/Zod models for Passenger, PublicProfile, PassengerPublication,
  Passenger images, NFC, and provisional Access/Recovery ownership records;
- stable opaque `passengerId` plus separate permanent `passengerNo`,
  `publicProfileId`, imported Legacy NFC public aliases, and migration aliases;
- an atomic, idempotent `RegisterPassenger` slice that creates a private draft
  and appends an outbox event;
- a stable Passenger reference query for Legacy/vNext integrations;
- a minimal idempotent Commerce inbox receipt that deliberately does not copy
  Order or Payment models or change Access;
- a privacy-aware public-profile projection;
- a deterministic synthetic Archive Bundle v1 producer, privacy-safe Registry
  fact mappers, and a real producer/consumer compatibility check against
  `forest-bus-archive`;
- an initial OpenAPI contract, event JSON Schema, architecture guardrail, and
  unit/contract tests.

The in-memory adapter is test-only. No production database, bucket, queue,
authentication, HTTP server, infrastructure, migration, or deployment is
claimed by this repository state. The Access/Recovery records are also only
provisional shapes: verified-email recovery states, global identity
uniqueness, email change/removal, device grants, single-Passenger transfer,
authorization, and audited commands remain production blockers.

The current Registry outbox shapes are internal staging records only. No event
publisher or external consumer is approved; versioned JSON Schema and consumer
review are required before either registration or migration events leave the
Registry boundary.

## Why the current systems cannot simply be continued

- Legacy currently uses human-readable `passengerNo` as the effective identity
  key and mixes Passenger with Product, Order acquisition, Cognito ownership,
  image upload, NFC, claim, and light-interaction mechanisms. Those facts must
  be separated before Legacy can become a general Commerce system.
- vNext is currently a paused, documentation-only design. Its useful NFC and
  identity invariants can move here, but its assumption that vNext owns a
  second Passenger/NFC database is superseded.
- Archive v1 originally accepted only `forest-bus-legacy` as producer. The
  companion narrow contract amendment now accepts an honest
  `forest-bus-registry` synthetic producer and preserves provenance, without
  changing Archive's read-only runtime or approving production cutover.

## Local development

Requirements: Node.js 24 and the exact pnpm version pinned in `package.json`.
In a fresh workspace, install Registry and Archive separately from each
repository's committed lockfile before running the cross-repository check:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --dir ../forest-bus-archive install --frozen-lockfile
corepack pnpm check:workspace
```

`archive:compat` expects `../forest-bus-archive` by default. It reports the
consumer revision, dirty state, aggregate success, and synthetic checksum. The
public Registry repository's default `GITHUB_TOKEN` cannot read the private
Archive repository, so repository CI runs the self-contained `pnpm check` and
the cross-repository check runs in a controlled workspace with explicit
read-only Archive access. Environment variables cannot bypass the committed
consumer lock; retain that separate run as review evidence.

## Next gates

1. Inventory and checksum all Legacy Passenger/NFC/access writers and the two
   claimed import manifests; do not infer production counts from code. The
   reviewed Legacy revision
   `67ef297f0fcb0b18dbde25988678efc98d96bf88` contains only
   `scripts/one-off-passenger-import-20260605.mjs`, whose contract expects 18
   records. Registry contains neither claimed manifest and has no second-batch
   evidence or evidence for the claimed total of 37.
2. Approve full Passenger, PassengerPublication, media, new NFC issuance,
   Access/Recovery, auth, and persistence semantics before production
   implementation.
3. Build an isolated Registry store, object bucket, inbox/outbox, operator API,
   public resolver, and migration importer with synthetic/staging data.
4. Import and reconcile aliases and images, shadow reads, and run Archive
   compatibility regularly.
5. For each approved dependent fact-group window, fence that group's Legacy
   write paths, drain asynchronous work, apply the final delta, enable the
   Registry writer, and revoke the corresponding Legacy direct permissions.
6. During active operation, route reconciled `/p/*` and `/n/*` traffic from
   Legacy to Registry. At a separately approved final business shutdown,
   export the last snapshot and route Registry to Archive.

Before any production traffic, evidence must show that Legacy and vNext
principals are effectively denied Registry database writes and Registry image
bucket Put/Delete/Copy/multipart actions. A document, source import scan, or
separate repository is not permission evidence; retain IAM simulation and live
`AccessDenied` probe results for every deployed principal.

Detailed ownership, migration gates, ADRs, and integration rules are under
[`docs/`](docs/architecture/ownership.md).
