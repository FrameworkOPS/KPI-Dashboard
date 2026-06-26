// Derived from docs/jobnimbus-schema/jobnimbus-metadata.json.
// Keep this small and intentional: runtime logic should use stable field-name
// candidates, while the full generated schema remains docs/context.

export const JOB_MATERIAL_FIELD_CANDIDATES = [
  'What Material?',
  'Current Material',
  'Primary Material',
  'Existing Material',
] as const;

export const WORK_ORDER_SQS_FIELD_CANDIDATES = [
  '# Of SQS',
  '# of SQS',
  'SQS',
  'Squares',
] as const;

export const JOBNIMBUS_PIPELINE_STATUS_NAMES = [
  'Contract Sent',
  'Estimate Info Gathered',
  'Installation WIP',
  'Lead',
  'Lost',
  'New Bid',
  'Plan Review',
  'Production - Long Term Sched',
  'Production - Mats Ordered',
  'Production Scheduled',
  'Project Closed Out',
  'RFI',
  'Sent To Production',
  'Signed Contract',
] as const;

