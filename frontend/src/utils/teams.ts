import { TeamType } from '../types'

// Single source of truth for the department list. Every team dropdown and
// filter renders from this array, so adding a department is a one-line change
// here (mirrored in backend/src/constants/teams.ts).
export const TEAMS: { value: Exclude<TeamType, 'all'>; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'estimating', label: 'Estimating' },
  { value: 'production', label: 'Production' },
  { value: 'office', label: 'Office' },
  { value: 'leadership', label: 'Leadership' },
]

export const TEAM_VALUES = TEAMS.map((t) => t.value)

export const teamLabel = (value: string): string =>
  TEAMS.find((t) => t.value === value)?.label ?? value
