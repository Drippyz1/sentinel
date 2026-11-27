import type { ProcessInfo, ProcessPage, ProcessPageRequest } from '../contracts/metrics'

export const PROCESS_LIMIT = 4096
export const PROCESS_PAGE_SIZE = 50
export const LIVE_PROCESS_LIMIT = 100

export function isProcessPageRequest(value: unknown): value is ProcessPageRequest {
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 5) return false
  const input = value as Partial<ProcessPageRequest>
  return (
    ['query', 'page', 'sort', 'direction', 'filter'].every((key) => Object.hasOwn(input, key)) &&
    typeof input.query === 'string' &&
    input.query.length <= 128 &&
    typeof input.page === 'number' &&
    Number.isInteger(input.page) &&
    input.page >= 0 &&
    input.page < Math.ceil(PROCESS_LIMIT / PROCESS_PAGE_SIZE) &&
    (input.sort === 'cpuPercent' ||
      input.sort === 'memoryBytes' ||
      input.sort === 'name' ||
      input.sort === 'pid') &&
    (input.direction === 'asc' || input.direction === 'desc') &&
    (input.filter === 'all' || input.filter === 'cpu' || input.filter === 'memory')
  )
}

export function selectProcesses(
  rows: readonly ProcessInfo[],
  request: Omit<ProcessPageRequest, 'page'>
): ProcessInfo[] {
  const query = request.query.trim().toLowerCase()
  return rows
    .filter(
      (row) =>
        (request.filter === 'all' ||
          (request.filter === 'cpu'
            ? (row.cpuPercent ?? -1) >= 5
            : (row.memoryPercent ?? -1) >= 1)) &&
        (!query || row.name.toLowerCase().includes(query) || String(row.pid).includes(query))
    )
    .sort((a, b) => {
      const left = a[request.sort]
      const right = b[request.sort]
      if (left === null || right === null)
        return Number(left === null) - Number(right === null) || a.pid - b.pid
      const order =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : Number(left) - Number(right)
      return (request.direction === 'asc' ? order : -order) || a.pid - b.pid
    })
}

export function pageProcesses(
  rows: readonly ProcessInfo[],
  request: ProcessPageRequest,
  metadata: Pick<ProcessPage, 'collectedAt' | 'reported' | 'truncated'>
): ProcessPage {
  const matched = selectProcesses(rows, request)
  const pageCount = Math.max(1, Math.ceil(matched.length / PROCESS_PAGE_SIZE))
  const page = Math.min(request.page, pageCount - 1)
  const start = page * PROCESS_PAGE_SIZE
  return {
    ...metadata,
    rows: matched.slice(start, start + PROCESS_PAGE_SIZE),
    captured: rows.length,
    matching: matched.length,
    page,
    pageCount
  }
}
