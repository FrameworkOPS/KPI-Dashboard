import React from 'react'

type StatusVariant =
  | 'on_track'
  | 'off_track'
  | 'done'
  | 'not_started'
  | 'open'
  | 'in_progress'
  | 'solved'
  | 'pending'
  | 'complete'
  | 'scheduled'
  | 'high'
  | 'medium'
  | 'low'
  | 'admin'
  | 'leadership'
  | 'manager'
  | string

interface StatusBadgeProps {
  status: StatusVariant
  label?: string
  size?: 'sm' | 'md'
}

const variantMap: Record<string, string> = {
  on_track: 'bg-green-500/20 text-green-400 border border-green-500/30',
  off_track: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  done: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  not_started: 'bg-slate-600/40 text-slate-400 border border-slate-500/30',
  open: 'bg-red-500/20 text-red-400 border border-red-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  solved: 'bg-green-500/20 text-green-400 border border-green-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  complete: 'bg-green-500/20 text-green-400 border border-green-500/30',
  scheduled: 'bg-slate-600/40 text-slate-400 border border-slate-500/30',
  high: 'bg-red-500/20 text-red-400 border border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-slate-600/40 text-slate-400 border border-slate-500/30',
  admin: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  leadership: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  manager: 'bg-green-500/20 text-green-400 border border-green-500/30',
  team_member: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
  invited: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
}

const labelMap: Record<string, string> = {
  on_track: 'On Track',
  off_track: 'Off Track',
  done: 'Done',
  not_started: 'Not Started',
  open: 'Open',
  in_progress: 'In Progress',
  solved: 'Solved',
  pending: 'Pending',
  complete: 'Complete',
  scheduled: 'Scheduled',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  admin: 'Admin',
  leadership: 'Leadership',
  manager: 'Manager',
  team_member: 'Team Member',
  invited: 'Invited',
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, size = 'sm' }) => {
  const classes = variantMap[status] || 'bg-slate-600/40 text-slate-400 border border-slate-500/30'
  const displayLabel = label ?? labelMap[status] ?? status

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm'

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${classes}`}>
      {displayLabel}
    </span>
  )
}

export default StatusBadge
