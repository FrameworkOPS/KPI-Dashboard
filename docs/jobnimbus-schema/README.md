# JobNimbus Schema Context

This folder contains JobNimbus schema context copied from the Skyright Intake Engine after the Phase 1 schema sync.

Files:

- `jobnimbus-metadata.json`: field names, observed value types, observed counts, statuses, and record types inferred from live JobNimbus API records.
- `jobnimbus-types.ts`: generated TypeScript shape for the metadata snapshot.

The metadata snapshot is intentionally context-only. It stores field names, types, counts, and source labels, not customer row values.

Current source:

- Repository: `FrameworkOPS/skyright-intake`
- Commit: `f6183f5`
- Source mode: `live_record_inference`
- Pulled with the accepted Railway production JobNimbus environment.

Use this when adjusting KPI Dashboard logic that reads JobNimbus raw payloads, especially material classification, SQS extraction, pipeline status mapping, estimates, work orders, and custom-field names.

Runtime helpers derived from this schema live in:

- `backend/src/services/jobNimbusSchemaContext.ts`

Those helpers intentionally expose only stable field-name candidates, not the full generated metadata payload.
