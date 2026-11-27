export interface StorageNavigation {
  folders: number[]
  index: number
}

export const INITIAL_STORAGE_NAV: StorageNavigation = { folders: [0], index: 0 }

export function visitStorageFolder(nav: StorageNavigation, folder: number): StorageNavigation {
  if (nav.folders[nav.index] === folder) return nav
  const folders = [...nav.folders.slice(Math.max(0, nav.index - 62), nav.index + 1), folder]
  return { folders, index: folders.length - 1 }
}

export function stepStorageFolder(nav: StorageNavigation, step: -1 | 1): StorageNavigation {
  const index = Math.max(0, Math.min(nav.folders.length - 1, nav.index + step))
  return index === nav.index ? nav : { ...nav, index }
}
