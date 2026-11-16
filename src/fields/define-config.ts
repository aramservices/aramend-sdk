import type { SiteConfig } from "./types.js"

/** Identity helper that preserves literal types so content can be inferred from the config. */
export function defineConfig<const C extends SiteConfig>(config: C): C {
  return config
}
