# Archive producer contract

Registry produces an offline, deterministic, strictly allowlisted
`ArchivePublicBundleV1` with `source.system = forest-bus-registry`.

The authoritative consumer contract remains in the independent
`forest-bus-archive` repository. Registry deliberately does not vendor a second
copy of that JSON Schema. The shared-workspace compatibility check imports the
Archive runtime validator and compares its canonical JSON and checksum with the
Registry producer:

```bash
pnpm archive:compat
```

Use `FOREST_BUS_ARCHIVE_DIR` when Archive is not at the default sibling path.
Automated checks must also set `FOREST_BUS_ARCHIVE_REVISION` to the exact
approved consumer commit; pinned checks reject a dirty Archive worktree.
Passing this synthetic check proves only producer/consumer shape compatibility.
It does not approve production data, images, snapshot storage, deployment,
domain cutover, DNS, or `/p/*` and `/n/*` route cutover.
