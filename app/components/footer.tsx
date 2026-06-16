import type { MouseEvent } from 'react'
import { Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import pkg from '../../package.json'
import { formatUserBlacklistSyncAge, useUserBlacklistSyncStatus } from '../lib/user-blacklist-sync'
import { Container } from './ui/container'

function getRepoUrl(repository: unknown): string | null {
  if (typeof repository === 'string') {
    return repository
  }
  if (repository && typeof repository === 'object' && 'url' in repository) {
    const url = (repository as { url?: unknown }).url
    return typeof url === 'string' ? url : null
  }
  return null
}

function normalizeRepoUrl(url: string): string {
  let out = url.trim()
  if (out.startsWith('git+'))
    out = out.slice('git+'.length)
  if (out.startsWith('git://'))
    out = `https://${out.slice('git://'.length)}`
  if (out.endsWith('.git'))
    out = out.slice(0, -'.git'.length)
  return out
}

function isLikelyGithubHandle(value: string): boolean {
  const s = value.trim().replace(/^@/, '')
  if (!s || /\s/.test(s)) {
    return false
  }
  // very small heuristic; keeps us from linking "John Doe" to GitHub
  return /^[a-z0-9][a-z0-9-]{0,37}$/i.test(s)
}

function isLikelyGitSha(value: string): boolean {
  const s = value.trim()
  // SHA-1 is 40 hex chars; we allow >=7 to support short SHAs, but keep placeholder like "000dev" unlinked
  return /^[a-f0-9]{7,40}$/i.test(s)
}

function getAuthorInfo(author: unknown): { name: string, url: string | null } | null {
  if (typeof author === 'string') {
    const name = author
    const url = isLikelyGithubHandle(name) ? `https://github.com/${name.trim().replace(/^@/, '')}` : null
    return { name, url }
  }

  if (author && typeof author === 'object') {
    const name = 'name' in author ? (author as { name?: unknown }).name : undefined
    if (typeof name !== 'string' || !name.trim()) {
      return null
    }

    const urlRaw = 'url' in author ? (author as { url?: unknown }).url : undefined
    const url = typeof urlRaw === 'string' ? urlRaw : null
    return { name, url }
  }

  return null
}

function BlacklistSyncMiniStatus() {
  const { address } = useAccount()
  const syncState = useUserBlacklistSyncStatus(address)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!syncState.enabled)
      return

    const interval = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(interval)
  }, [syncState.enabled])

  if (!syncState.enabled)
    return null

  const ageMs = syncState.lastSyncAt ? Math.max(0, now - syncState.lastSyncAt) : undefined
  const isStale = ageMs != null && ageMs > 5 * 60 * 1000
  const label = syncState.busy
    ? 'syncing'
    : syncState.error
      ? 'sync err'
      : syncState.lastSyncAt
        ? `sync ${formatUserBlacklistSyncAge(syncState.lastSyncAt, now)}`
        : 'sync --'
  const title = syncState.error
    ? syncState.error
    : syncState.lastSyncAt
      ? `Last blacklist sync: ${new Date(syncState.lastSyncAt).toLocaleString()}`
      : 'Blacklist sync enabled; no completed sync yet'
  const tone = syncState.error
    ? 'text-orange-300/80'
    : syncState.busy
      ? 'text-blue-300/70'
      : isStale
        ? 'text-yellow-300/70'
        : 'text-gray-500'

  return (
    <span className={`font-mono text-[10px] leading-none tabular-nums ${tone}`} title={title} aria-label={title}>
      {label}
    </span>
  )
}

export function Footer() {
  const version = typeof pkg.version === 'string' ? pkg.version : null
  const repoUrlRaw = getRepoUrl(pkg.repository)
  const repoUrl = repoUrlRaw ? normalizeRepoUrl(repoUrlRaw) : null
  const author = getAuthorInfo(pkg.author)
  const gitSha = typeof __GIT_SHA__ === 'string' && __GIT_SHA__.trim() ? __GIT_SHA__.trim() : null
  const gitShaShort = gitSha ? gitSha.slice(0, 7) : null
  const gitShaTitle = gitSha || undefined
  const shouldLinkCommit = !!(repoUrl && gitSha && isLikelyGitSha(gitSha) && repoUrl.includes('github.com/'))
  const commitUrl = shouldLinkCommit ? `${repoUrl.replace(/\/$/, '')}/commit/${gitSha}` : null

  const onOpenAdvancedSettings = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (typeof window === 'undefined')
      return
    const baseUrl = (import.meta as any).env?.BASE_URL as string | undefined
    const homePath = new URL(baseUrl && typeof baseUrl === 'string' ? baseUrl : '/', window.location.origin).pathname
    const isHome = window.location.pathname === homePath
    if (isHome) {
      window.dispatchEvent(new Event('open-advanced-settings'))
      return
    }
    window.location.assign(`${homePath}#advanced-settings`)
  }

  return (
    <footer className="border-t border-gray-800 text-gray-400 text-xs">
      <Container className="py-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 sm:items-center">
            {repoUrl
              ? (
                  <a href={repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-gray-200">
                    <span aria-hidden="true">🐙</span>
                    <span>GitHub</span>
                    <span aria-hidden="true" className="opacity-80">
                      ↗
                    </span>
                  </a>
                )
              : <span />}

            {(version || gitShaShort) && (
              <span className="tabular-nums">
                {version && (
                  <>
                    v
                    {version}
                  </>
                )}
                {gitShaShort && (
                  <>
                    {version ? ' · ' : ''}
                    {commitUrl
                      ? (
                          <a
                            href={commitUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-gray-200"
                            title={gitShaTitle}
                          >
                            {gitShaShort}
                          </a>
                        )
                      : <span title={gitShaTitle}>{gitShaShort}</span>}
                  </>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            {author
              ? (
                  <div className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true">🤖</span>
                    <span>
                      Made by
                      {' '}
                      {author.url == null
                        ? <span>{author.name}</span>
                        : (
                            <a href={author.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-gray-200">
                              {author.name}
                            </a>
                          )}
                    </span>
                  </div>
                )
              : <span />}

            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <BlacklistSyncMiniStatus />
              <a
                href="#advanced-settings"
                onClick={onOpenAdvancedSettings}
                className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-gray-200"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Advanced
              </a>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  )
}
