import { create } from 'zustand'

// One data point in time for any metric
export interface DataPoint {
  timestamp: number // Unix ms — used as the X axis
  value: number // the metric value — used as the Y axis
}

// How many data points to keep per metric
// At one reading per 2 seconds, 60 points = 2 minutes of history
const MAX_POINTS = 60

interface HistoryState {
  cpu: DataPoint[]
  memory: DataPoint[]
  diskRead: DataPoint[]
  diskWrite: DataPoint[]
  networkDown: DataPoint[]
  networkUp: DataPoint[]

  pushSnapshot: (snapshot: {
    timestamp: number
    cpu: number
    memory: number
    diskRead: number
    diskWrite: number
    networkDown: number
    networkUp: number
  }) => void
}

// Helper that appends a new point and trims old ones
// Written once here so we don't repeat this logic 6 times
function appendPoint(arr: DataPoint[], value: number, timestamp: number): DataPoint[] {
  const newPoint: DataPoint = { timestamp, value }
  const updated = [...arr, newPoint]
  // If we have more than MAX_POINTS, drop the oldest ones from the front
  return updated.length > MAX_POINTS ? updated.slice(updated.length - MAX_POINTS) : updated
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  cpu: [],
  memory: [],
  diskRead: [],
  diskWrite: [],
  networkDown: [],
  networkUp: [],

  pushSnapshot: (snapshot) =>
    set((state) => ({
      cpu: appendPoint(state.cpu, snapshot.cpu, snapshot.timestamp),
      memory: appendPoint(state.memory, snapshot.memory, snapshot.timestamp),
      diskRead: appendPoint(state.diskRead, snapshot.diskRead, snapshot.timestamp),
      diskWrite: appendPoint(state.diskWrite, snapshot.diskWrite, snapshot.timestamp),
      networkDown: appendPoint(state.networkDown, snapshot.networkDown, snapshot.timestamp),
      networkUp: appendPoint(state.networkUp, snapshot.networkUp, snapshot.timestamp)
    }))
}))
