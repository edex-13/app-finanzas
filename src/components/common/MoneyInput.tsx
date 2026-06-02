import * as React from 'react'
import { Input } from '@/components/ui/input'
import { parseMoneyInput } from '@/lib/format'

interface Props
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange'
  > {
  value: number | undefined
  onChange: (value: number) => void
}

export const MoneyInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, ...props }, ref) => {
    const [text, setText] = React.useState<string>(
      value !== undefined ? String(value) : '',
    )
    React.useEffect(() => {
      setText(value !== undefined ? String(value) : '')
    }, [value])
    return (
      <Input
        ref={ref}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseMoneyInput(e.target.value))
        }}
        placeholder="0"
        {...props}
      />
    )
  },
)
MoneyInput.displayName = 'MoneyInput'
