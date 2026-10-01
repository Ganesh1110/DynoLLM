import { useEffect, useRef } from 'react'
import { createMonitoringWS, createEventsWS } from '../services/api'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'

const WATCHDOG_TIMEOUT_MS = 10000 // 10s without metric message triggers staleness watchdog

export function useWebSocket() {
  const monWsRef = useRef(null)
  const evtWsRef = useRef(null)
  const setConnected = useMonitoringStore((s) => s.setConnected)
  const handleMetrics = useMonitoringStore((s) => s.handleMetrics)
  const handleBenchEvent = useBenchmarkStore((s) => s.handleWebSocketEvent)
  const handleLoadEvent = useLoadTestStore((s) => s.handleWebSocketEvent)

  useEffect(() => {
    let unmounted = false
    let monReconnectTimer = null
    let evtReconnectTimer = null
    let watchdogTimer = null
    let monDelay = 2000
    let evtDelay = 2000

    function resetWatchdog() {
      if (watchdogTimer) clearTimeout(watchdogTimer)
      if (unmounted) return

      watchdogTimer = setTimeout(() => {
        if (unmounted) return
        // No message arrived within 10s — half-open socket or server stalled
        setConnected(false)
        if (monWsRef.current && monWsRef.current.readyState === WebSocket.OPEN) {
          try {
            monWsRef.current.close()
          } catch {
            // ignore
          }
        }
      }, WATCHDOG_TIMEOUT_MS)
    }

    function connectMon() {
      if (unmounted) return
      if (monReconnectTimer) clearTimeout(monReconnectTimer)

      try {
        monWsRef.current = createMonitoringWS(
          (data) => {
            if (unmounted) return
            monDelay = 2000 // reset backoff on successful packet
            setConnected(true)
            handleMetrics(data)
            resetWatchdog()
          },
          () => {
            if (unmounted) return
            setConnected(false)
            if (watchdogTimer) clearTimeout(watchdogTimer)
            monReconnectTimer = setTimeout(connectMon, monDelay)
            monDelay = Math.min(monDelay * 1.5, 30000) // exponential backoff capped at 30s
          }
        )
      } catch {
        if (!unmounted) {
          setConnected(false)
          monReconnectTimer = setTimeout(connectMon, monDelay)
          monDelay = Math.min(monDelay * 1.5, 30000)
        }
      }
    }

    function connectEvt() {
      if (unmounted) return
      if (evtReconnectTimer) clearTimeout(evtReconnectTimer)

      try {
        evtWsRef.current = createEventsWS(
          (data) => {
            if (unmounted) return
            evtDelay = 2000
            handleBenchEvent(data)
            handleLoadEvent(data)
          },
          () => {
            if (unmounted) return
            evtReconnectTimer = setTimeout(connectEvt, evtDelay)
            evtDelay = Math.min(evtDelay * 1.5, 30000)
          }
        )
      } catch {
        if (!unmounted) {
          evtReconnectTimer = setTimeout(connectEvt, evtDelay)
          evtDelay = Math.min(evtDelay * 1.5, 30000)
        }
      }
    }

    connectMon()
    connectEvt()

    return () => {
      unmounted = true
      if (monReconnectTimer) clearTimeout(monReconnectTimer)
      if (evtReconnectTimer) clearTimeout(evtReconnectTimer)
      if (watchdogTimer) clearTimeout(watchdogTimer)
      setConnected(false)
      try { monWsRef.current?.close() } catch {}
      try { evtWsRef.current?.close() } catch {}
    }
  }, [setConnected, handleMetrics, handleBenchEvent, handleLoadEvent])
}
