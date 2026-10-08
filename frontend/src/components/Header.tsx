import React from 'react'
import { usePageTitle } from '../utils/pageTitle'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

const Header: React.FC<HeaderProps> = ({ title, actions }) => {
  usePageTitle(title)
  return (
    <header className="md:h-16 bg-slate-800 border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-0 flex-shrink-0">
      {/* Title is shown by mobile top bar on small screens — hide here to avoid duplication */}
      <h1 className="sr-only md:not-sr-only text-xl font-semibold text-white">{title}</h1>
      {actions && (
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {actions}
        </div>
      )}
    </header>
  )
}

export default Header
