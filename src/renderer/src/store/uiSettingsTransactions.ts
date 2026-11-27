import type { UiSettingsPatch } from '../../../shared/contracts/settings'
import { combineUiSettingsPatches } from '../../../shared/utils/uiSettingsPatch'

export interface UiSaveState {
  saving: boolean
  failed: boolean
  canRetry: boolean
}

interface Options {
  save: (patch: UiSettingsPatch) => Promise<boolean>
  revision: () => number
  onStatus: (status: UiSaveState) => void
}

export function createUiSettingsTransactions({ save, revision, onStatus }: Options) {
  let saving = false
  let next: { patch: UiSettingsPatch; retryable: boolean } | undefined
  let failure: { patch: UiSettingsPatch; revision: number; retryable: boolean } | undefined

  function report(): void {
    onStatus({
      saving,
      failed: failure !== undefined,
      canRetry: !saving && failure?.retryable === true && failure.revision === revision()
    })
  }

  async function drain(): Promise<void> {
    saving = true
    failure = undefined
    report()
    while (next) {
      const { patch, retryable } = next
      const sentAt = revision()
      next = undefined
      try {
        if (await save(patch)) continue
      } catch {
        // A rejected invoke is also a failed transaction; committed state stays untouched.
      }
      failure = { patch, revision: sentAt, retryable }
    }
    saving = false
    report()
  }

  function submit(patch: UiSettingsPatch, retryable = true): void {
    next = {
      patch: next ? combineUiSettingsPatches(next.patch, patch) : patch,
      retryable: retryable && (next?.retryable ?? true)
    }
    if (!saving) void drain()
  }

  return {
    submit,
    retry: () => {
      if (!saving && failure?.retryable && failure.revision === revision()) submit(failure.patch)
    },
    onRevision: () => {
      if (failure) report()
    }
  }
}
