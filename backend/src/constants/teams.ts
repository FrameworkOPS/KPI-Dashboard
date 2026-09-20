// Single source of truth for the departments the dashboard is scoped by.
// Every team dropdown, filter, and validation list derives from this array, so
// adding a department is a one-line change here plus its scorecard template.
export const TEAMS = ['sales', 'estimating', 'production', 'office', 'leadership'] as const;

export type Team = typeof TEAMS[number];

// 'all' is not a department — it is the cross-team scope used by leadership,
// admins, and users who span departments.
export const TEAMS_WITH_ALL: readonly string[] = [...TEAMS, 'all'];

export function isTeam(value: unknown): value is Team {
  return typeof value === 'string' && (TEAMS as readonly string[]).includes(value);
}

export function isTeamOrAll(value: unknown): boolean {
  return typeof value === 'string' && TEAMS_WITH_ALL.includes(value);
}
