import type { UserBlacklistBlob } from '../app/lib/user-blacklist-sync'
import { describe, expect, test } from 'bun:test'
import { formatUserBlacklistSyncAge, mergeUserBlacklistBlobs } from '../app/lib/user-blacklist-sync'

function blob(overrides: Partial<UserBlacklistBlob>): UserBlacklistBlob {
  return {
    v: 1,
    u: 1,
    c: {},
    o: {},
    w: {},
    r: {},
    ...overrides,
  }
}

describe('user blacklist sync age label', () => {
  test('formats compact seconds, minutes, and hours', () => {
    const now = 1_000_000

    expect(formatUserBlacklistSyncAge(now - 4_000, now)).toBe('4s')
    expect(formatUserBlacklistSyncAge(now - 125_000, now)).toBe('2m')
    expect(formatUserBlacklistSyncAge(now - 3_900_000, now)).toBe('1h5m')
  })

  test('uses zero seconds for future or same-time timestamps', () => {
    const now = 1_000_000

    expect(formatUserBlacklistSyncAge(now, now)).toBe('0s')
    expect(formatUserBlacklistSyncAge(now + 30_000, now)).toBe('0s')
  })
})

describe('user blacklist sync merge', () => {
  test('keeps newer deletion tombstones over stale remote entries', () => {
    const remote = blob({
      c: {
        1: {
          '0x1111111111111111111111111111111111111111': { t: 100, s: 'OLD' },
        },
      },
    })
    const local = blob({
      c: {
        1: {
          '0x1111111111111111111111111111111111111111': { t: 200, d: true },
        },
      },
    })

    const merged = mergeUserBlacklistBlobs(remote, local)

    expect(merged.c['1']['0x1111111111111111111111111111111111111111']).toEqual({ t: 200, d: true })
  })

  test('keeps newer entries over stale deletion tombstones', () => {
    const remote = blob({
      w: {
        8453: {
          '0x2222': { t: 100, d: true },
        },
      },
    })
    const local = blob({
      w: {
        8453: {
          '0x2222': { t: 200, ls: 'USDC', cs: 'WETH' },
        },
      },
    })

    const merged = mergeUserBlacklistBlobs(remote, local)

    expect(merged.w['8453']['0x2222']).toEqual({ t: 200, ls: 'USDC', cs: 'WETH' })
  })

  test('unions independent desktop and mobile changes', () => {
    const desktop = blob({
      o: {
        1: {
          '0x3333333333333333333333333333333333333333': { t: 100, p: 'Provider A' },
        },
      },
    })
    const mobile = blob({
      c: {
        8453: {
          '0x4444444444444444444444444444444444444444': { t: 110, s: 'TOKEN' },
        },
      },
    })

    const merged = mergeUserBlacklistBlobs(desktop, mobile)

    expect(merged.o['1']['0x3333333333333333333333333333333333333333']).toEqual({ t: 100, p: 'Provider A' })
    expect(merged.c['8453']['0x4444444444444444444444444444444444444444']).toEqual({ t: 110, s: 'TOKEN' })
  })

  test('syncs newer collateral approval decisions', () => {
    const remote = blob({
      r: {
        1: {
          '0x5555555555555555555555555555555555555555': { t: 100, x: 'ban', s: 'OLD' },
        },
      },
    })
    const local = blob({
      r: {
        1: {
          '0x5555555555555555555555555555555555555555': { t: 200, x: 1, s: 'TOKEN' },
        },
      },
    })

    const merged = mergeUserBlacklistBlobs(remote, local)

    expect(merged.r['1']['0x5555555555555555555555555555555555555555']).toEqual({ t: 200, x: 1, s: 'TOKEN' })
  })

  test('keeps newer collateral decision tombstones', () => {
    const remote = blob({
      r: {
        8453: {
          '0x6666666666666666666666666666666666666666': { t: 100, x: 1, s: 'TOKEN' },
        },
      },
    })
    const local = blob({
      r: {
        8453: {
          '0x6666666666666666666666666666666666666666': { t: 200, d: true },
        },
      },
    })

    const merged = mergeUserBlacklistBlobs(remote, local)

    expect(merged.r['8453']['0x6666666666666666666666666666666666666666']).toEqual({ t: 200, d: true })
  })
})
