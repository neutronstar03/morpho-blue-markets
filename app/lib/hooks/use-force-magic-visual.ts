import { useEffect, useState } from 'react'

const FORCE_MAGIC_VISUAL_KEY = 'home-magic:force-rainbow'

export function useForceMagicVisual() {
  const [isForced, setIsForced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined')
      return

    const params = new URLSearchParams(window.location.search)
    const magicParam = params.get('magic')

    if (magicParam === '1') {
      window.localStorage.setItem(FORCE_MAGIC_VISUAL_KEY, '1')
      setIsForced(true)
      return
    }

    if (magicParam === '0') {
      window.localStorage.removeItem(FORCE_MAGIC_VISUAL_KEY)
      setIsForced(false)
      return
    }

    setIsForced(window.localStorage.getItem(FORCE_MAGIC_VISUAL_KEY) === '1')
  }, [])

  return isForced
}
