// Derived from docs/jobnimbus-schema/jobnimbus-metadata.json.
// Keep this small and intentional: runtime logic should use stable field-name
// candidates, while the full generated schema remains docs/context.

// Job-level fields that indicate material type (observed in live JN data).
// Ordered by reliability: What Material? has observed_count 47, Job Type 28,
// Current Material 23. Primary/Existing Material appear only on work orders.
export const JOB_MATERIAL_FIELD_CANDIDATES = [
  'What Material?',
  'Job Type',
  'Current Material',
  'Primary Material',
  'Existing Material',
] as const;

// SQS field names observed in JN job records (# of SQS, lowercase, count 42)
// and work order records (# Of SQS, uppercase Of, count 30). Both normalise
// to the same token so the extractor finds either form.
export const WORK_ORDER_SQS_FIELD_CANDIDATES = [
  '# Of SQS',
  '# of SQS',
  'SQS',
  'Squares',
] as const;

// All status names observed in live JN records (from jobnimbus-metadata.json).
export const JOBNIMBUS_PIPELINE_STATUS_NAMES = [
  'Active',
  'Appt Scheduled',
  'Approved',
  'Contract Sent',
  'Draft',
  'Estimate Info Gathered',
  'Installation WIP',
  'Lead',
  'Lost',
  'New',
  'New Bid',
  'Plan Review',
  'Production - Long Term Sched',
  'Production - Mats Ordered',
  'Production Scheduled',
  'Project Closed Out',
  'RFI',
  'Sent',
  'Sent To Production',
  'Signed Contract',
  'T/O to Production',
  'Webform',
] as const;

