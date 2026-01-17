/// <reference types="vite/client" />

declare const __GIT_SHA__: string | null

interface ImportMetaEnv {
  readonly VITE_CF_ANALYTICS_TOKEN?: string
}

declare module '*.svg?react' {
  import type { FunctionComponent, SVGProps } from 'react'

  const content: FunctionComponent<SVGProps<SVGSVGElement>>
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}
