interface ZipEntry {
  name: string
  content: string | Uint8Array
}

interface PreparedEntry {
  name: Buffer
  content: Buffer
  crc: number
  offset: number
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function calculateCrc32(content: Buffer): number {
  let crc = 0xffffffff
  for (const byte of content) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(date.getFullYear(), 1980)
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  }
}

export function createZip(entries: ZipEntry[], generatedAt = new Date()): ArrayBuffer {
  const { date, time } = getDosDateTime(generatedAt)
  const localParts: Buffer[] = []
  const preparedEntries: PreparedEntry[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const content =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf8')
        : Buffer.from(entry.content)
    const localHeader = Buffer.alloc(30)
    const crc = calculateCrc32(content)

    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(date, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(content.length, 18)
    localHeader.writeUInt32LE(content.length, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)

    preparedEntries.push({ name, content, crc, offset })
    localParts.push(localHeader, name, content)
    offset += localHeader.length + name.length + content.length
  }

  const centralDirectoryOffset = offset
  const centralParts = preparedEntries.flatMap((entry) => {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(entry.crc, 16)
    header.writeUInt32LE(entry.content.length, 20)
    header.writeUInt32LE(entry.content.length, 24)
    header.writeUInt16LE(entry.name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(entry.offset, 42)
    return [header, entry.name]
  })
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(preparedEntries.length, 8)
  end.writeUInt16LE(preparedEntries.length, 10)
  end.writeUInt32LE(centralDirectorySize, 12)
  end.writeUInt32LE(centralDirectoryOffset, 16)
  end.writeUInt16LE(0, 20)

  const archive = Buffer.concat([...localParts, ...centralParts, end])
  return archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer
}
