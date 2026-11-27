import { DUPLICATE_LIMITS, type DuplicateMember } from '../../shared/contracts/duplicates'
import { ContentIssue } from './content'

export type ImageInfo = NonNullable<DuplicateMember['image']>
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function dimensions(width: number, height: number, format: ImageInfo['format']): ImageInfo {
  if (!width || !height) throw new ContentIssue('invalidImage')
  if (
    width > DUPLICATE_LIMITS.photoDimension ||
    height > DUPLICATE_LIMITS.photoDimension ||
    width * height > DUPLICATE_LIMITS.photoPixels
  )
    throw new ContentIssue('imageLimit')
  return { width, height, format }
}

export function imageInfo(data: Buffer, format: ImageInfo['format'], chunks?: Buffer[]): ImageInfo {
  if (data.length > DUPLICATE_LIMITS.photoBytes) throw new ContentIssue('imageLimit')
  if (format === 'png') {
    if (
      data.length < 45 ||
      !data.subarray(0, 8).equals(png) ||
      data.readUInt32BE(8) !== 13 ||
      data.toString('ascii', 12, 16) !== 'IHDR'
    )
      throw new ContentIssue('invalidImage')
    const info = dimensions(data.readUInt32BE(16), data.readUInt32BE(20), format)
    let hasData = false
    chunks?.push(data.subarray(0, 8))
    for (let at = 8, count = 0; at + 12 <= data.length && count++ < 4096; ) {
      const size = data.readUInt32BE(at)
      const end = at + 12 + size
      if (end > data.length) break
      const type = data.toString('ascii', at + 4, at + 8)
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT')
        throw new ContentIssue('unsupportedFormat')
      if (type === 'IHDR' && at !== 8) break
      if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(type)) {
        chunks?.push(data.subarray(at, end))
      } else if ((data[at + 4] & 32) === 0) break
      if (type === 'IDAT') hasData = true
      if (hasData && type === 'IEND' && size === 0 && end === data.length) return info
      at = end
    }
  } else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let info: ImageInfo | undefined
    for (let at = 2; at + 3 < data.length; ) {
      if (data[at++] !== 0xff) break
      while (data[at] === 0xff) at++
      const marker = data[at++]
      if (marker === 0xda && info) return info
      if (marker === 0xd9 || at + 2 > data.length) break
      const length = data.readUInt16BE(at)
      if (length < 2 || at + length > data.length) break
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (![0xc0, 0xc1, 0xc2].includes(marker)) throw new ContentIssue('unsupportedFormat')
        if (length < 8 || data[at + 2] !== 8 || info) break
        info = dimensions(data.readUInt16BE(at + 5), data.readUInt16BE(at + 3), format)
      }
      at += length
    }
  }
  throw new ContentIssue('invalidImage')
}

export interface DecodedPhoto {
  width: number
  height: number
  // Luminance sample for dHash, not a full-resolution pixel buffer.
  sample: number[]
  preview: string | null
}
