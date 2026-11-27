import { parentPort, workerData } from 'node:worker_threads'
import { scanStorage } from './traverse'
import {
  initialScanReading,
  type ScanConfiguration,
  type WorkerInput,
  type WorkerOutput
} from './protocol'

const port = parentPort
if (!port) throw new Error('Storage scanner requires a worker port')
const { scope, cancellation } = workerData as ScanConfiguration
const signal = new Int32Array(cancellation)
const send = (message: WorkerOutput) => port.postMessage(message)

void scanStorage(scope, {
  cancelled: () => Atomics.load(signal, 0) !== 0,
  progress: (reading) => {
    if (reading.state === 'scanning') send({ type: 'progress', reading })
  }
})
  .then(({ index, reading }) => {
    if (reading.totals) {
      port.on('message', ({ token, query }: WorkerInput) => {
        send({ type: 'result', token, result: index.query(query) })
      })
    }
    send({ type: 'finished', reading })
    if (!reading.totals) port.close()
  })
  .catch(() => {
    send({
      type: 'finished',
      reading: { ...initialScanReading(), state: 'failed', failure: 'unavailable' }
    })
    port.close()
  })
