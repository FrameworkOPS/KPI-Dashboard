import React, { useId } from 'react'
import { useAuthStore } from '../store/authStore'
import { TeamType } from '../types'
import { TEAMS, teamLabel } from '../utils/teams'

interface TeamFilterProps {
  value: TeamType | 'all'
  onChange: (team: TeamType | 'all') => void
  includeAll?: boolean
}

const teams: { value: TeamType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Teams' },
  ...TEAMS,
]

const TeamFilter: React.FC<TeamFilterProps> = ({
  value,
  onChange,
  includeAll = true,
}) => {
  const { user } = useAuthStore()
  const id = useId()

  // Managers are locked to their own team
  if (user?.role === 'manager' || user?.role === 'team_member') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Team:</span>
        <span className="px-3 py-1.5 rounded-lg bg-slate-700 text-white text-sm font-medium border border-slate-600">
          {teamLabel(user.team)}
        </span>
      </div>
    )
  }

  const options = includeAll ? teams : teams.filter((t) => t.value !== 'all')

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-slate-400">Team:</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as TeamType | 'all')}
        className="bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default TeamFilter
