const PRIVATE_PATH_PATTERNS = [
  /\/Users\/[^/\s]+(?:\/[^\s"'<>]*)?/g,
  /\/home\/[^/\s]+(?:\/[^\s"'<>]*)?/g,
  /[A-Za-z]:\\Users\\[^\\\s]+(?:\\[^\s"'<>]*)?/g
]
const SENSITIVE_KEY_PATTERN = /token|secret|password|cookie|credential|serial|(?:^|_)path$|plist/i

export function sanitizePrivateText(value: string): string {
  let sanitized = value
  for (const pattern of PRIVATE_PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[private path]')
  }
  return sanitized
}

export function sanitizeForExport<T>(value: T): T {
  if (typeof value === 'string') return sanitizePrivateText(value) as T
  if (Array.isArray(value)) return value.map(sanitizeForExport) as T
  if (typeof value !== 'object' || value === null) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForExport(item)
    ])
  ) as T
}
