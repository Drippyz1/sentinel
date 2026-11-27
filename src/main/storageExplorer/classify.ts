import { extname } from 'node:path'
import type { StorageCategory } from '../../shared/contracts/storageExplorer'

export interface Classification {
  category: StorageCategory
  evidence: string
}

const extensions: Record<string, StorageCategory> = {
  appimage: 'applications',
  exe: 'applications',
  msi: 'applications',
  pkg: 'applications',
  jpg: 'images',
  jpeg: 'images',
  png: 'images',
  gif: 'images',
  heic: 'images',
  webp: 'images',
  svg: 'images',
  avif: 'images',
  mov: 'video',
  mp4: 'video',
  mkv: 'video',
  webm: 'video',
  wav: 'audio',
  mp3: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  opus: 'audio',
  pdf: 'documents',
  txt: 'documents',
  md: 'documents',
  doc: 'documents',
  docx: 'documents',
  xlsx: 'documents',
  odt: 'documents',
  rtf: 'documents',
  csv: 'documents',
  pptx: 'documents',
  zip: 'archives',
  gz: 'archives',
  bz2: 'archives',
  xz: 'archives',
  tar: 'archives',
  rar: 'archives',
  '7z': 'archives',
  dmg: 'archives',
  iso: 'archives'
}

export function classify(
  path: string,
  name: string,
  directory: boolean,
  platform: NodeJS.Platform = process.platform
): Classification {
  const normalized = (platform === 'win32' ? path.replaceAll('\\', '/') : path).toLowerCase()
  if (
    (platform === 'darwin' && /^\/system(?:\/|$)/.test(normalized)) ||
    (platform === 'linux' && /^\/(?:usr\/lib|usr\/bin|boot|etc)(?:\/|$)/.test(normalized)) ||
    (platform === 'win32' && /^[a-z]:\/windows(?:\/|$)/.test(normalized))
  )
    return { category: 'system', evidence: 'Recognized operating-system location.' }
  if (/(?:^|\/)(?:backups\.backupdb|mobilesync\/backup)(?:\/|$)/.test(normalized))
    return {
      category: 'backups',
      evidence: 'Recognized backup location; it may contain recovery data.'
    }
  if (/(?:^|\/)(?:library\/caches|\.cache)(?:\/|$)/.test(normalized))
    return {
      category: 'caches',
      evidence: 'Recognized cache location. Individual items were not verified as removable.'
    }
  if (/(?:^|\/)(?:node_modules|\.git|\.venv)(?:\/|$)/.test(normalized))
    return {
      category: 'development',
      evidence: 'Recognized development directory convention; projects or tools may depend on it.'
    }
  if (
    /(?:^|\/)(?:__pycache__|\.next\/static|library\/developer\/xcode\/deriveddata)(?:\/|$)/.test(
      normalized
    )
  )
    return {
      category: 'build',
      evidence: 'Recognized build or runtime artifact directory convention.'
    }
  if (platform === 'darwin' && /(?:^|\/)library\/application support(?:\/|$)/.test(normalized))
    return {
      category: 'appSupport',
      evidence: 'Recognized macOS Application Support location; contents may include user data.'
    }
  if (platform === 'darwin' && /\.app\//.test(directory ? normalized + '/' : normalized))
    return {
      category: 'applications',
      evidence: 'Inside a macOS application bundle by directory naming convention.'
    }
  const extension = directory ? '' : extname(name).slice(1).toLowerCase()
  if (extension && Object.hasOwn(extensions, extension))
    return {
      category: extensions[extension],
      evidence: 'Inferred from the file extension; contents were not inspected.'
    }
  return extension
    ? { category: 'other', evidence: 'File extension does not match a recognized category.' }
    : { category: 'unknown', evidence: 'Insufficient metadata to classify this item reliably.' }
}
