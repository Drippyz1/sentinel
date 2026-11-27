export function ToggleSwitch({
  checked,
  disabled = false,
  label,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="toggle-switch"
    >
      <span aria-hidden="true" />
    </button>
  )
}
