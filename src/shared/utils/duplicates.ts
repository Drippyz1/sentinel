import { DUPLICATE_LIMITS, type DuplicateQuery } from '../contracts/duplicates'

export function duplicateEntryId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < DUPLICATE_LIMITS.entries
  )
}

const fields = ['text', 'sort', 'threshold', 'page', 'group', 'memberPage', 'hideEmpty'] as const

export function isDuplicateQuery(value: unknown): value is DuplicateQuery {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    !fields.every((key) => Object.hasOwn(value, key))
  )
    return false
  const q = value as DuplicateQuery
  return (
    typeof q.text === 'string' &&
    q.text.length <= DUPLICATE_LIMITS.search &&
    (q.sort === 'bytes' || q.sort === 'copies' || q.sort === 'name' || q.sort === 'distance') &&
    Number.isInteger(q.threshold) &&
    q.threshold >= 0 &&
    q.threshold <= DUPLICATE_LIMITS.distance &&
    duplicateEntryId(q.page) &&
    q.page < Math.ceil(DUPLICATE_LIMITS.groups / DUPLICATE_LIMITS.groupPage) &&
    duplicateEntryId(q.memberPage) &&
    q.memberPage < Math.ceil(DUPLICATE_LIMITS.entries / DUPLICATE_LIMITS.memberPage) &&
    (q.group === null || (duplicateEntryId(q.group) && q.group < DUPLICATE_LIMITS.groups)) &&
    typeof q.hideEmpty === 'boolean'
  )
}
