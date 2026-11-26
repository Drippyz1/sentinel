import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export function isTrustedDocument(candidateUrl: string, trustedUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const trusted = new URL(trustedUrl)
    if (
      candidate.protocol !== trusted.protocol ||
      candidate.search !== trusted.search ||
      candidate.username ||
      candidate.password
    ) {
      return false
    }
    if (trusted.protocol === 'file:') {
      return (
        candidate.host === trusted.host &&
        normalize(fileURLToPath(candidate)) === normalize(fileURLToPath(trusted))
      )
    }
    return candidate.origin === trusted.origin && candidate.pathname === trusted.pathname
  } catch {
    return false
  }
}
