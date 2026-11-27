import { useLayoutEffect, useRef, type ReactNode } from 'react'

export function Modal({
  titleId,
  onClose,
  children,
  variant,
  locked = false
}: {
  titleId: string
  onClose: () => void
  children: ReactNode
  variant?: 'drawer' | 'palette'
  locked?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const trigger = document.activeElement
    dialog.showModal()
    const initial = dialog.querySelector<HTMLElement>('[data-initial-focus]')
    initial?.focus()
    return () => {
      dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected && trigger !== document.body) {
        trigger.focus()
      } else {
        document.getElementById('workspace-main')?.focus()
      }
    }
  }, [])
  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={titleId}
      className={`sentinel-dialog ${variant ? `sentinel-dialog--${variant}` : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented) return
        const candidates = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, a[href], summary, [tabindex]'
          )
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length &&
            getComputedStyle(element).visibility === 'visible'
        )
        const first = candidates[0]
        const last = candidates.at(-1)
        if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
          event.preventDefault()
          ;(event.shiftKey ? last : first)?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        if (!locked) onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || locked) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose()
      }}
    >
      {children}
    </dialog>
  )
}
