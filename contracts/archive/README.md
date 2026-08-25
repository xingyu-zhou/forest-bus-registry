# Archive producer contract

Registry produces an offline, deterministic, strictly allowlisted
`ArchivePublicBundleV1` with `source.system = forest-bus-registry`.

The authoritative consumer contract remains in the independent
`forest-bus-archive` repository. Registry deliberately does not vendor a second
copy of that JSON Schema. The shared-workspace compatibility check builds its
Bundle through the actual Registry profile/NFC projections, imports the
Archive runtime validator, verifies the four Passenger route families and NFC
route dispositions, and checks real synthetic image bytes against their
checksum and dimensions:

```bash
pnpm archive:compat
```

Use `FOREST_BUS_ARCHIVE_DIR` when Archive is not at the default sibling path.
The approved consumer revision is committed in
`contracts/archive/consumer-lock.json`. A conflicting
`FOREST_BUS_ARCHIVE_REVISION` is rejected rather than overriding that lock; a
replacement revision requires a reviewed lock-file change. Every check rejects
a dirty Archive worktree.
Passing this synthetic check proves only synthetic projection, shape, route,
and fixture-image compatibility.
It does not execute the Archive Worker HTTP router; GET/HEAD status, redirect,
header, and cache behavior remain a separate end-to-end Gate.
It does not approve production data, images, snapshot storage, deployment,
domain cutover, DNS, or `/p/*` and `/n/*` route cutover.
