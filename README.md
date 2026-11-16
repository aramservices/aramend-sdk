# @aramend/sdk

Site-side SDK for [aramend](https://github.com/aramb-dev/aramend): config types, a typed content client, the `aramend push` CLI and webhook verification.

ESM only. The client and webhook helpers use `fetch` and Web Crypto, so they run on Node 20+, edge runtimes and workers.

## Define fields

```ts
// aramend.config.ts
import { defineConfig } from "@aramend/sdk"

export default defineConfig({
  site: "my-site",
  models: {
    settings: {
      kind: "singleton",
      fields: { title: { type: "text", required: true }, logo: { type: "image" } },
    },
    events: {
      kind: "collection",
      titleField: "name",
      fields: { name: { type: "text", required: true }, date: { type: "date" } },
    },
  },
})
```

## Push the schema

```bash
ARAMEND_URL=https://cms.example.com ARAMEND_PUSH_KEY=am_push_… pnpm exec aramend push
pnpm exec aramend push --env-file .env.local   # or load env from a file
pnpm exec aramend push --force                 # apply breaking changes
```

Exits non-zero on invalid configs (422), breaking changes without `--force` (409) and auth errors.

## Read content

```ts
import { createClient } from "@aramend/sdk/client"
import type config from "./aramend.config"

const cms = createClient<typeof config>({
  url: process.env.ARAMEND_URL!,
  readKey: process.env.ARAMEND_READ_KEY!,
  fetchOptions: { next: { tags: ["aramend"] } }, // optional, Next.js
})

const { data } = await cms.getSingleton("settings") // data: { title: string; logo: ImageValue | null } | null
const events = await cms.getCollection("events", { limit: 20, offset: 0 })
const event = await cms.getEntry("events", id) // null if missing or unpublished
```

API errors throw `AramendError` with `status`, `code` and `details`.

`required` fields are typed non-null, but a required field added after an entry was published reads as `null` until that entry is republished.

## Verify revalidate webhooks

```ts
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache"
import { verifyWebhookRequest } from "@aramend/sdk/webhook"

export async function POST(request: Request) {
  const result = await verifyWebhookRequest(request, {
    secret: process.env.ARAMEND_WEBHOOK_SECRET!,
  })
  if (!result.ok) return new Response(result.reason, { status: 401 })
  revalidateTag("aramend")
  return Response.json({ revalidated: true })
}
```

It checks `x-aramend-signature` (an HMAC-SHA256 of `"<timestamp>.<raw body>"`) with a constant-time compare, and rejects timestamps more than 5 minutes off (set `toleranceSeconds` to change that).

## Schema tooling

`@aramend/sdk/schema` exports `parseSiteConfig`, `diffSchemas`, `validateEntry`, asset rules and walkers. The CMS uses these too.
