import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createJiti } from "jiti"

const CANDIDATES = [
  "aramend.config.ts",
  "aramend.config.mts",
  "aramend.config.js",
  "aramend.config.mjs",
]

export function findConfigPath(cwd: string, explicit?: string): string {
  if (explicit) {
    const path = resolve(cwd, explicit)
    if (!existsSync(path)) throw new Error(`Config not found: ${path}`)
    return path
  }
  for (const name of CANDIDATES) {
    const path = resolve(cwd, name)
    if (existsSync(path)) return path
  }
  throw new Error(
    `No aramend.config.ts in ${cwd}. Pass --config <path> to point at one.`,
  )
}

/** Imports the config module (TS via jiti) and returns its default export. */
export async function loadConfig(path: string): Promise<unknown> {
  const jiti = createJiti(import.meta.url, { moduleCache: false })
  try {
    return await jiti.import(path, { default: true })
  } catch (cause) {
    throw new Error(`Failed to load ${path}`, { cause })
  }
}
