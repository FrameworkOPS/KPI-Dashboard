import React from 'react'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

const Header: React.FC<HeaderProps> = ({ title, actions }) => {
  return (
    <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  )
}

export default Header
