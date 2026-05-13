import React from 'react'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

const Header: React.FC<HeaderProps> = ({ title, actions }) => {
  return (
    <header className="md:h-16 bg-slate-800 border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-0 flex-shrink-0">
      {/* Title is shown by mobile top bar on small screens — hide here to avoid duplication */}
      <h1 className="hidden md:block text-xl font-semibold text-white">{title}</h1>
      {actions && (
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {actions}
        </div>
      )}
    </header>
  )
}

export default Header
