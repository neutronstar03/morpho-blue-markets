import { ArrowPathIcon } from '@heroicons/react/20/solid'
import { Button } from '~/components/ui/button'

interface SubmitButtonProps {
  disabled: boolean
  isLoading: boolean
  idleLabel: string
  loadingLabel: string
  variant?: 'default' | 'outline'
  spinnerClassName?: string
}

export function SubmitButton({
  disabled,
  isLoading,
  idleLabel,
  loadingLabel,
  variant = 'default',
  spinnerClassName = 'text-white',
}: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={disabled} className="w-full" variant={variant}>
      {isLoading
        ? (
            <>
              <ArrowPathIcon className={`animate-spin -ml-1 mr-3 h-5 w-5 ${spinnerClassName}`} aria-hidden="true" />
              {loadingLabel}
            </>
          )
        : idleLabel}
    </Button>
  )
}
