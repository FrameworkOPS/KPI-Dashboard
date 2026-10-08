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

interface TeamScopedUser {
  role: string
  team: string
  teams?: string[]
}

/** Admin and leadership work across every team; everyone else is scoped. */
export const isSingleTeamRole = (user: TeamScopedUser | null | undefined): boolean =>
  !!user && user.role !== 'admin' && user.role !== 'leadership'

/** The teams a user may file work under, in the order they are listed. */
export function accessibleTeams(user: TeamScopedUser | null | undefined): Exclude<TeamType, 'all'>[] {
  if (!user || !isSingleTeamRole(user)) return TEAM_VALUES
  const own = [user.team, ...(user.teams || [])].filter((t): t is Exclude<TeamType, 'all'> =>
    (TEAM_VALUES as readonly string[]).includes(t))
  return own.length ? Array.from(new Set(own)) : TEAM_VALUES
}

/**
 * The team a new item should default to: the active filter when it names a
 * real team, otherwise the user's own team, otherwise the first team they
 * can use. 'all' is never a team an item can belong to.
 */
export function defaultTeamFor(
  user: TeamScopedUser | null | undefined,
  activeFilter?: string | null,
): Exclude<TeamType, 'all'> {
  const allowed = accessibleTeams(user)
  if (activeFilter && (allowed as readonly string[]).includes(activeFilter)) return activeFilter as Exclude<TeamType, 'all'>
  if (user?.team && (allowed as readonly string[]).includes(user.team)) return user.team as Exclude<TeamType, 'all'>
  return allowed[0]
}
