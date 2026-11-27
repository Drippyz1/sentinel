import { parentPort, workerData } from 'node:worker_threads'
import { DuplicateAnalysis, duplicateReading, type Decode } from './analysis'
import type { AnalysisConfiguration, AnalysisInput, AnalysisOutput, DecodeResult } from './protocol'

const port = parentPort
if (!port) throw new Error('Duplicate analysis requires a worker port')
const config = workerData as AnalysisConfiguration
const flag = new Int32Array(config.cancellation)
const send = (message: AnalysisOutput) => port.postMessage(message)
let sequence = 0
let decoding: { sequence: number; resolve: (result: DecodeResult) => void } | null = null
const decode: Decode = (data, format, preview) => {
  if (decoding) return Promise.resolve('unavailable')
  return new Promise((resolve) => {
    decoding = { sequence: ++sequence, resolve }
    const copied = Uint8Array.from(data)
    port.postMessage(
      { type: 'decode', sequence, data: copied, format, preview } satisfies AnalysisOutput,
      [copied.buffer]
    )
  })
}
const analysis = new DuplicateAnalysis(
  config.scope,
  config.mode,
  () => Atomics.load(flag, 0) !== 0,
  (reading) => {
    if (reading.state === 'running') send({ type: 'progress', reading })
  },
  decode
)
let finished = false
let previewing = false
port.on('message', (message: AnalysisInput) => {
  if (message.type === 'decoded') {
    if (decoding?.sequence === message.sequence) {
      const current = decoding
      decoding = null
      current.resolve(message.result)
    }
  } else if (!finished || previewing) {
    send({ type: 'result', sequence: message.sequence, result: null })
  } else if (message.type === 'query') {
    send({ type: 'result', sequence: message.sequence, result: analysis.query(message.query) })
  } else {
    previewing = true
    void analysis
      .preview(message.group, message.entry)
      .then(
        (result) => send({ type: 'result', sequence: message.sequence, result }),
        () => send({ type: 'result', sequence: message.sequence, result: null })
      )
      .finally(() => {
        previewing = false
      })
  }
})
void analysis
  .run()
  .then((reading) => {
    finished = reading.state !== 'failed'
    send({ type: 'finished', reading })
    if (!finished) port.close()
  })
  .catch(() => {
    send({ type: 'finished', reading: duplicateReading('failed') })
    port.close()
  })
