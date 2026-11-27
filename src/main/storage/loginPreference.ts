export interface LoginPreference {
  read: () => boolean | null
  apply: (desired: boolean) => void
}

export function commitWithLoginPreference(
  persist: () => boolean,
  login: LoginPreference,
  intent: boolean | undefined
): { success: boolean; launchAtLoginActual: boolean | null; launchAtLoginError: boolean } {
  const success = persist()
  const previous = login.read()
  if (!success || intent === undefined || intent === previous) {
    return { success, launchAtLoginActual: previous, launchAtLoginError: false }
  }
  try {
    login.apply(intent)
  } catch {
    // The OS can apply a change before reporting an error; always read back.
  }
  const actual = login.read()
  return { success, launchAtLoginActual: actual, launchAtLoginError: actual !== intent }
}
