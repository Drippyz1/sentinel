import { create } from 'zustand'

export interface DataPoint {
  timestamp: number
  value: number
}

const WINDOW_MS = 120_000

interface HistoryState {
  cpu: DataPoint[]
  memory: DataPoint[]
  diskRead: DataPoint[]
  diskWrite: DataPoint[]
  networkDown: DataPoint[]
  networkUp: DataPoint[]
  gpu: DataPoint[]
  battery: DataPoint[]

  pushSnapshot: (snapshot: {
    timestamp: number
    cpu: number | null
    memory: number | null
    diskRead: number | null
    diskWrite: number | null
    networkDown: number | null
    networkUp: number | null
    gpu: number | null
    battery: number | null
  }) => void
}

function appendOptionalPoint(
  arr: DataPoint[],
  value: number | null,
  timestamp: number
): DataPoint[] {
  const oldest = timestamp - WINDOW_MS
  const recent =
    arr.length && arr[0].timestamp < oldest ? arr.filter((point) => point.timestamp >= oldest) : arr
  return value === null || !Number.isFinite(value)
    ? recent
    : [...recent, { timestamp, value }].slice(-122)
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  cpu: [],
  memory: [],
  diskRead: [],
  diskWrite: [],
  networkDown: [],
  networkUp: [],
  gpu: [],
  battery: [],

  pushSnapshot: (snapshot) =>
    set((state) => ({
      cpu: appendOptionalPoint(state.cpu, snapshot.cpu, snapshot.timestamp),
      memory: appendOptionalPoint(state.memory, snapshot.memory, snapshot.timestamp),
      diskRead: appendOptionalPoint(state.diskRead, snapshot.diskRead, snapshot.timestamp),
      diskWrite: appendOptionalPoint(state.diskWrite, snapshot.diskWrite, snapshot.timestamp),
      networkDown: appendOptionalPoint(state.networkDown, snapshot.networkDown, snapshot.timestamp),
      networkUp: appendOptionalPoint(state.networkUp, snapshot.networkUp, snapshot.timestamp),
      gpu: appendOptionalPoint(state.gpu, snapshot.gpu, snapshot.timestamp),
      battery: appendOptionalPoint(state.battery, snapshot.battery, snapshot.timestamp)
    }))
}))
