import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Dashboard } from './pages/Dashboard'
import { Runtimes } from './pages/Runtimes'
import { Benchmark } from './pages/Benchmark'
import { LoadTest } from './pages/LoadTest'
import { History } from './pages/History'
import { useWebSocket } from './hooks/useWebSocket'

function AppContent() {
  useWebSocket() // Persistent WebSocket connection for monitoring and test events

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/runtimes" element={<Runtimes />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/load-test" element={<LoadTest />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
      <footer className="border-t border-gray-900 py-4 text-center text-xs text-gray-600">
        ⚡ DynoLLM • Production-Readiness Benchmarking & Load Testing for Local LLMs
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
