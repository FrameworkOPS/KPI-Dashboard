import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  /** Rendered inside the app shell: fill the content area, not the screen. */
  inline?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className={`${this.props.inline ? 'min-h-[60vh]' : 'min-h-screen'} bg-slate-900 flex items-center justify-center p-6`} role="alert">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-white font-semibold text-lg mb-2">This page hit an error</h2>
            <p className="text-slate-400 text-sm mb-1">{this.state.error?.message}</p>
            <p className="text-slate-400 text-xs mb-6">Nothing you entered elsewhere was lost. Reload to try again, or go back to the dashboard.</p>
            <div className="flex justify-center gap-2 flex-wrap">
              <button
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 min-h-[44px] rounded-lg transition-colors"
              >
                Reload page
              </button>
              <button
                onClick={() => window.location.assign('/')}
                className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-5 py-2 min-h-[44px] rounded-lg transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
