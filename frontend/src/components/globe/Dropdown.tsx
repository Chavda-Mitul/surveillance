import type { CSSProperties } from "react"

export interface DropdownOption<T> {
  value: T
  label: string
}

interface DropdownProps<T> {
  options: DropdownOption<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
  style?: CSSProperties
}

export function Dropdown<T>({ 
  options, 
  value, 
  onChange, 
  label,
  style 
}: DropdownProps<T>) {
  return (
    <div style={style}>
      {label && <label style={dropdownStyles.label}>{label}</label>}
      <select
        value={value as string}
        onChange={(e) => {
          const selected = options.find(opt => opt.value === e.target.value)
          if (selected) onChange(selected.value)
        }}
        style={dropdownStyles.select}
      >
        {options.map((option) => (
          <option key={option.value as string} value={option.value as string}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const dropdownStyles = {
  label: {
    display: "block",
    color: "white",
    fontSize: 12,
    marginBottom: 4,
    textTransform: "capitalize" as const,
  },
  select: {
    padding: "10px 16px",
    fontSize: 14,
    borderRadius: 4,
    border: "none",
    backgroundColor: "#333",
    color: "white",
    cursor: "pointer",
    minWidth: 150,
    textTransform: "capitalize" as const,
  } as CSSProperties,
}
