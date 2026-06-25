export const LEAD_TIME_THRESHOLDS = { red: 8, yellow: 6, green: 4 };

export function getLeadTimeStatus(weeks: number): 'RED' | 'YELLOW' | 'GREEN' {
  if (weeks >= LEAD_TIME_THRESHOLDS.red) return 'RED';
  if (weeks >= LEAD_TIME_THRESHOLDS.yellow) return 'YELLOW';
  return 'GREEN';
}

export function getLeadTimeColorClass(status: 'RED' | 'YELLOW' | 'GREEN'): string {
  return {
    RED: 'bg-red-100 text-red-800 border-red-300',
    YELLOW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    GREEN: 'bg-green-100 text-green-800 border-green-300',
  }[status];
}
