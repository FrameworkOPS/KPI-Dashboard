import React from 'react'
import Header from '../components/Header'

const LearningDen: React.FC = () => {
  return (
    <>
      <Header title="Learning Den" />
      <div className="p-4 md:p-6">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 md:p-12 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 mx-auto bg-blue-600/15 border border-blue-500/30 rounded-2xl flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Learning Den — Coming Soon</h2>
          <p className="text-sm text-slate-400 mb-6">
            Our internal knowledge base. SOPs, training videos, and onboarding content
            will live here — Trainual-style, with assignments, completion tracking,
            and graded quizzes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            {[
              { title: 'SOP Library', desc: 'Searchable docs and policies by department.' },
              { title: 'Training Tracks', desc: 'Assign courses, watch videos, sign off completion.' },
              { title: 'Quizzes & Grades', desc: 'Auto-graded checks for understanding.' },
            ].map((f) => (
              <div key={f.title} className="bg-slate-700/30 border border-slate-700 rounded-xl p-4">
                <p className="text-sm font-medium text-white mb-1">{f.title}</p>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export default LearningDen
