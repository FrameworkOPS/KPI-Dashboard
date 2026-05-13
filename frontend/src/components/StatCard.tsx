import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate'
  icon?: React.ReactNode
}

const colorMap = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
  slate: 'text-slate-400',
}

const trendIconUp = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
  </svg>
)

const trendIconDown = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
  </svg>
)

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  color = 'blue',
  icon,
}) => {
  const valueColor = colorMap[color]

  const trendColor =
    trend === 'up' ? 'text-green-400' :
    trend === 'down' ? 'text-red-400' :
    'text-slate-400'

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-5 flex flex-col gap-1.5 md:gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs md:text-sm font-medium text-slate-400 truncate">{title}</p>
        {icon && <div className={`${valueColor} opacity-70 flex-shrink-0`}>{icon}</div>}
      </div>
      <p className={`text-2xl md:text-3xl font-bold ${valueColor} truncate`}>{value}</p>
      <div className="flex items-center gap-2">
        {subtitle && <p className="text-[11px] md:text-xs text-slate-500 truncate">{subtitle}</p>}
        {trend && trendValue && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
            {trend === 'up' ? trendIconUp : trend === 'down' ? trendIconDown : null}
            {trendValue}
          </span>
        )}
      </div>
    </div>
  )
}

export default StatCard
