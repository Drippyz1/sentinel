import { create } from 'zustand'

// One data point in time for any metric
export interface DataPoint {
  timestamp: number   // Unix ms — used as the X axis
  value: number       // the metric value — used as the Y axis
}

// How many data points to keep per metric
// At one reading per 2 seconds, 60 points = 2 minutes of history
const MAX_POINTS = 60

interface HistoryState {
  cpu:             DataPoint[]
  memory:          DataPoint[]
  diskRead:        DataPoint[]
  diskWrite:       DataPoint[]
  networkDown:     DataPoint[]
  networkUp:       DataPoint[]

  pushCpu:         (value: number) => void
  pushMemory:      (value: number) => void
  pushDiskRead:    (value: number) => void
  pushDiskWrite:   (value: number) => void
  pushNetworkDown: (value: number) => void
  pushNetworkUp:   (value: number) => void
}

// Helper that appends a new point and trims old ones
// Written once here so we don't repeat this logic 6 times
function appendPoint(arr: DataPoint[], value: number): DataPoint[] {
  const newPoint: DataPoint = { timestamp: Date.now(), value }
  const updated = [...arr, newPoint]
  // If we have more than MAX_POINTS, drop the oldest ones from the front
  return updated.length > MAX_POINTS ? updated.slice(updated.length - MAX_POINTS) : updated
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  cpu:         [],
  memory:      [],
  diskRead:    [],
  diskWrite:   [],
  networkDown: [],
  networkUp:   [],

  pushCpu:         (value) => set(state => ({ cpu:         appendPoint(state.cpu,         value) })),
  pushMemory:      (value) => set(state => ({ memory:      appendPoint(state.memory,      value) })),
  pushDiskRead:    (value) => set(state => ({ diskRead:    appendPoint(state.diskRead,    value) })),
  pushDiskWrite:   (value) => set(state => ({ diskWrite:   appendPoint(state.diskWrite,   value) })),
  pushNetworkDown: (value) => set(state => ({ networkDown: appendPoint(state.networkDown, value) })),
  pushNetworkUp:   (value) => set(state => ({ networkUp:   appendPoint(state.networkUp,   value) })),
}))