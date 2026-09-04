import { useEffect, useRef } from 'react'
import { createMonitoringWS, createEventsWS } from '../services/api'
import { useMonitoringStore } from '../stores/monitoringStore'
import { useBenchmarkStore } from '../stores/benchmarkStore'
import { useLoadTestStore } from '../stores/loadTestStore'

export function useWebSocket() {
  const monWsRef = useRef(null)
  const evtWsRef = useRef(null)
  const setConnected = useMonitoringStore((s) => s.setConnected)
  const handleMetrics = useMonitoringStore((s) => s.handleMetrics)
  const handleBenchEvent = useBenchmarkStore((s) => s.handleWebSocketEvent)
  const handleLoadEvent = useLoadTestStore((s) => s.handleWebSocketEvent)

  useEffect(() => {
    let monReconnect, evtReconnect

    function connectMon() {
      monWsRef.current = createMonitoringWS(
        (data) => {
          setConnected(true)
          handleMetrics(data)
        },
        () => {
          setConnected(false)
          monReconnect = setTimeout(connectMon, 3000)
        }
      )
    }

    function connectEvt() {
      evtWsRef.current = createEventsWS(
        (data) => {
          handleBenchEvent(data)
          handleLoadEvent(data)
        },
        () => {
          evtReconnect = setTimeout(connectEvt, 3000)
        }
      )
    }

    connectMon()
    connectEvt()

    return () => {
      clearTimeout(monReconnect)
      clearTimeout(evtReconnect)
      monWsRef.current?.close()
      evtWsRef.current?.close()
    }
  }, [])
}
