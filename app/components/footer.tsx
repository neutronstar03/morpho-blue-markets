import pkg from '../../package.json'
import { Container } from './ui/container'

function getRepoUrl(repository: unknown): string | null {
  if (typeof repository === 'string')
    return repository
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
  if (!s || /\s/.test(s))
    return false
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
    const url = isLikelyGithubHandle(name)
      ? `https://github.com/${name.trim().replace(/^@/, '')}`
      : null
    return { name, url }
  }

  if (author && typeof author === 'object') {
    const name = 'name' in author ? (author as { name?: unknown }).name : undefined
    if (typeof name !== 'string' || !name.trim())
      return null

    const urlRaw = 'url' in author ? (author as { url?: unknown }).url : undefined
    const url = typeof urlRaw === 'string' ? urlRaw : null
    return { name, url }
  }

  return null
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
  const commitUrl
    = shouldLinkCommit
      ? `${repoUrl.replace(/\/$/, '')}/commit/${gitSha}`
      : null

  return (
    <footer className="border-t border-gray-800 text-gray-400 text-xs">
      <Container className="py-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            {repoUrl
              ? (
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-gray-200"
                  >
                    <span aria-hidden="true">🐙</span>
                    <span>GitHub</span>
                    <span aria-hidden="true" className="opacity-80">↗</span>
                  </a>
                )
              : (
                  <span />
                )}

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
                      : (
                          <span title={gitShaTitle}>{gitShaShort}</span>
                        )}
                  </>
                )}
              </span>
            )}
          </div>

          {author && (
            <div className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">🤖</span>
              <span>
                Made by
                {' '}
                {author.url
                  ? (
                      <a
                        href={author.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-gray-200"
                      >
                        {author.name}
                      </a>
                    )
                  : (
                      <span>{author.name}</span>
                    )}
              </span>
            </div>
          )}
        </div>
      </Container>
    </footer>
  )
}
