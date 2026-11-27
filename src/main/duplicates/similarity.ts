import type { DecodedPhoto } from './imageFormat'

export interface PhotoSignature {
  hash: bigint
  average: number
  aspect: number
}

export function photoSignature(photo: DecodedPhoto): PhotoSignature | null {
  const { sample, width, height } = photo
  if (sample.length !== 72 || Math.max(...sample) - Math.min(...sample) < 24) return null
  let hash = 0n
  let edges = 0
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const at = row * 9 + col
      if (Math.abs(sample[at] - sample[at + 1]) >= 6) edges++
      hash = (hash << 1n) | (sample[at] > sample[at + 1] ? 1n : 0n)
    }
  if (edges < 8) return null
  return {
    hash,
    average: sample.reduce((sum, value) => sum + value, 0) / 72,
    aspect: width / height
  }
}

export function hamming(a: bigint, b: bigint): number {
  let count = 0
  for (let bits = BigInt.asUintN(64, a ^ b); bits; bits &= bits - 1n) count++
  return count
}

export function photoDistance(a: PhotoSignature, b: PhotoSignature): number | null {
  if (Math.abs(Math.log(a.aspect / b.aspect)) > 0.16 || Math.abs(a.average - b.average) > 42)
    return null
  return hamming(a.hash, b.hash)
}
