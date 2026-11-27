import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

export function useWorkspaceActivity(activity: string | null) {
  const update = useOutletContext<((activity: string | null) => void) | null>()
  useEffect(() => {
    update?.(activity)
    return () => update?.(null)
  }, [activity, update])
}
