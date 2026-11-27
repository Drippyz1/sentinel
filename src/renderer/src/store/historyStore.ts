import { create } from 'zustand'
import { appendObservation, type Observation } from '../../../shared/utils/visualization'

const LIVE_SERIES = [
  'cpu',
  'memory',
  'diskRead',
  'diskWrite',
  'networkDown',
  'networkUp',
  'gpu',
  'battery'
] as const
export type LiveSeriesKey = (typeof LIVE_SERIES)[number]
export type DataPoint = Observation
const breaks = new Set<LiveSeriesKey>()

type HistoryState = Record<LiveSeriesKey, Observation[]> & {
  interrupt: (keys?: readonly LiveSeriesKey[]) => void
  reset: () => void
  pushSnapshot: (timestamp: number, samples: Record<LiveSeriesKey, Observation | undefined>) => void
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
  interrupt: (keys = LIVE_SERIES) => {
    for (const key of keys) breaks.add(key)
  },
  reset: () => {
    breaks.clear()
    set({
      cpu: [],
      memory: [],
      diskRead: [],
      diskWrite: [],
      networkDown: [],
      networkUp: [],
      gpu: [],
      battery: []
    })
  },
  pushSnapshot: (timestamp, samples) =>
    set((state) => {
      const update: Partial<HistoryState> = {}
      for (const key of LIVE_SERIES) {
        const sample = samples[key]
        const next = appendObservation(
          state[key],
          sample && breaks.has(key) ? { ...sample, breakBefore: true } : sample,
          timestamp
        )
        if (next !== state[key]) {
          update[key] = next
          if (
            sample &&
            next.at(-1)?.timestamp === sample.timestamp &&
            state[key].at(-1)?.timestamp !== sample.timestamp
          )
            breaks.delete(key)
        }
      }
      return Object.keys(update).length ? update : state
    })
}))
