#!/usr/bin/env node
import { parseArgs } from "node:util"
import { runPush } from "./cli/push.js"

const HELP = `Usage: aramend <command> [options]

Commands:
  push              Push aramend.config.ts to the CMS

Options:
  --config <path>   Config file (default: ./aramend.config.ts)
  --env-file <path> Load env vars from a file (e.g. .env.local)
  --force           Apply breaking schema changes
  -h, --help        Show this help

Env: ARAMEND_URL, ARAMEND_PUSH_KEY`

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      "env-file": { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  })

  const [command] = positionals
  if (values.help || !command) {
    console.log(HELP)
    return values.help ? 0 : 1
  }

  if (values["env-file"]) process.loadEnvFile(values["env-file"])

  switch (command) {
    case "push":
      return runPush({
        cwd: process.cwd(),
        configPath: values.config,
        force: values.force,
        url: process.env.ARAMEND_URL,
        pushKey: process.env.ARAMEND_PUSH_KEY,
      })
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`)
      return 1
  }
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(
      "[aramend]",
      error instanceof Error ? error.message : error,
      error instanceof Error && error.cause ? error.cause : "",
    )
    process.exitCode = 1
  },
)
