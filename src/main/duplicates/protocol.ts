import type {
  DuplicateMode,
  DuplicatePreview,
  DuplicateQuery,
  DuplicateReading,
  DuplicateResult
} from '../../shared/contracts/duplicates'
import type { AuthorizedScope } from '../storageExplorer/scope'
import type { DecodedPhoto, ImageInfo } from './imageFormat'

export interface AnalysisConfiguration {
  scope: AuthorizedScope
  mode: DuplicateMode
  cancellation: SharedArrayBuffer
}
export type DecodeResult = DecodedPhoto | 'unavailable' | null
export type AnalysisInput =
  | { type: 'query'; sequence: number; query: DuplicateQuery }
  | { type: 'preview'; sequence: number; group: number; entry: number }
  | { type: 'decoded'; sequence: number; result: DecodeResult }
export type AnalysisOutput =
  | { type: 'progress' | 'finished'; reading: DuplicateReading }
  | { type: 'result'; sequence: number; result: DuplicateResult | DuplicatePreview | null }
  | {
      type: 'decode'
      sequence: number
      data: Uint8Array
      format: ImageInfo['format']
      preview: boolean
    }
