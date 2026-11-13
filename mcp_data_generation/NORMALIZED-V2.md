# Opt-in Normalized Document v2 producer (candidate)

The default remains `schema_version: 1`. This change adds an explicit v2 producer path, but **does not migrate the MCP server or make v2 the canonical consumer contract**.

From `mcp_data_generation`, first export an artifact catalog using the acquisition work proposed in upstream PR #32 (or an equivalent independently reviewed catalog producer), then use a fresh curated directory:

```sh
python -m src.artifact_records --raw data/raw --registry data/ingestion_registry.json --output data/artifacts
python -m src.curate --processed data/processed --registry data/ingestion_registry.json --artifact-catalog data/artifacts --schema-version 2 --curated data/curated-v2
python -m unittest discover --start-directory tests --top-level-directory . --verbose
```

The v2 producer maps actual registry file→processed document relationships, deduplicates and lexicographically sorts their source digests, and rejects missing catalog records or unrecognized source associations. It does not assign an artifact merely because filenames share a meeting identifier. The resulting SAID covers the complete v2 normalized record; collection timestamps and source attribution are no longer identity-bearing fields in that record. It does **not** prove source-system authenticity or establish collection history.

**Migration boundary:** Do not point the existing MCP server at `curated-v2` until its schema v2 reader, Raw Artifact resolution, missing-provenance behavior, and index rebuild integration are implemented and tested. Use separate v1/v2 curated directories. No automatic conversion of existing indexes is performed.

This candidate depends on upstream approval of issue #8 / PR #31 and the acquisition-side records in PR #32. The final consumer migration must also reconcile the existing PR #24 resolution contract; this producer PR does not duplicate that work.
