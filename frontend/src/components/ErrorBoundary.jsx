import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('DynoLLM caught component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card bg-gray-900 border-red-900/50 p-6 my-6 text-center space-y-4 max-w-xl mx-auto">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Something went wrong</h2>
          <p className="text-xs text-red-300 font-mono bg-red-950/40 p-3 rounded border border-red-900/40 text-left overflow-x-auto">
            {this.state.error?.message || 'Unknown render error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary text-xs inline-flex items-center space-x-2 px-4 py-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Page</span>
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
