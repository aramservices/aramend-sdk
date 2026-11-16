import type { BreakingChange } from "../fields/diff-schema.js"
import { parseSiteConfig } from "../fields/parse-config.js"
import { findConfigPath, loadConfig } from "./load-config.js"

export type PushOptions = {
  cwd: string
  configPath?: string
  force: boolean
  url: string | undefined
  pushKey: string | undefined
}

type PushResponse =
  | { status: "applied"; version: number; breaking: BreakingChange[] }
  | { status: "unchanged"; version: number }

type ErrorResponse = {
  error?: { code?: string; message?: string; details?: unknown }
}

/** Pushes the site config. Returns the process exit code. */
export async function runPush(options: PushOptions): Promise<number> {
  const { url, pushKey } = options
  if (!url || !pushKey) {
    console.error(
      "Missing ARAMEND_URL or ARAMEND_PUSH_KEY. Set them in the environment or pass --env-file <path>.",
    )
    return 1
  }

  const path = findConfigPath(options.cwd, options.configPath)
  const config = await loadConfig(path)

  // Same structural check the CMS runs, so obvious mistakes fail offline.
  const parsed = parseSiteConfig(config)
  if (!parsed.ok) {
    printList(`Invalid config (${path}):`, parsed.errors)
    return 1
  }

  const endpoint = `${url.replace(/\/+$/, "")}/api/v1/schema`
  console.log(
    `Pushing "${parsed.config.site}" to ${endpoint}${options.force ? " (force)" : ""}`,
  )

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${pushKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ config: parsed.config, force: options.force }),
    })
  } catch (cause) {
    console.error(`Could not reach ${endpoint}:`, cause)
    return 1
  }

  const body = (await res.json().catch(() => null)) as
    | PushResponse
    | ErrorResponse
    | null

  if (res.ok && body && "status" in body) {
    if (body.status === "unchanged") {
      console.log(`Unchanged (version ${body.version}).`)
      return 0
    }
    console.log(`Applied version ${body.version}.`)
    if (body.breaking.length)
      printBreaking("Forced past breaking changes:", body.breaking)
    return 0
  }

  const error = body && "error" in body ? body.error : undefined
  switch (res.status) {
    case 401:
      console.error("Unauthorized: check ARAMEND_PUSH_KEY (needs push scope).")
      break
    case 422:
      printList("CMS rejected the config:", asStrings(error?.details))
      break
    case 409:
      printBreaking(
        "Breaking changes (existing content would be orphaned):",
        asBreaking(error?.details),
      )
      console.error("\nRe-run with --force to apply anyway.")
      break
    default:
      console.error(
        `Push failed: ${res.status} ${error?.message ?? res.statusText}`,
      )
  }
  return 1
}

function printList(title: string, items: string[]): void {
  console.error(title)
  for (const item of items) console.error(`  - ${item}`)
}

function printBreaking(title: string, changes: BreakingChange[]): void {
  printList(
    title,
    changes.map((c) => `${c.path}: ${c.reason}`),
  )
}

function asStrings(details: unknown): string[] {
  return Array.isArray(details) ? details.map(String) : []
}

function asBreaking(details: unknown): BreakingChange[] {
  return Array.isArray(details) ? (details as BreakingChange[]) : []
}
