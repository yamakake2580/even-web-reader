import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

// bridge.getLocalStorage/setLocalStorage is the only storage that survives a
// glasses/app restart - plain browser localStorage gets wiped. There is no
// "list all keys" call, so we eagerly load a fixed set of known keys once at
// startup into an in-memory cache: reads are then synchronous, writes are
// write-through (cache updated immediately, persisted async).
const KNOWN_KEYS = ['backend_url', 'reading_position'] as const
export type StorageKey = (typeof KNOWN_KEYS)[number]

const cache = new Map<string, string>()
let bridgeRef: EvenAppBridge | null = null

export async function initStorage(bridge: EvenAppBridge): Promise<void> {
  bridgeRef = bridge
  await Promise.all(
    KNOWN_KEYS.map(async (key) => {
      try {
        const value = await bridge.getLocalStorage(key)
        if (value) cache.set(key, value)
      } catch (err) {
        console.error(`getLocalStorage(${key}) failed:`, err)
      }
    }),
  )
}

export function getStorage(key: StorageKey): string | undefined {
  return cache.get(key)
}

export function setStorage(key: StorageKey, value: string): void {
  cache.set(key, value)
  bridgeRef?.setLocalStorage(key, value).catch((err) => console.error(`setLocalStorage(${key}) failed:`, err))
}
