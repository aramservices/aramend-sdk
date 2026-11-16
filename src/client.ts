// Typed read client for the aramend content API. Uses global fetch; runs on Node, edge and browsers.
import type { InferModel, Model, SiteConfig } from "./fields/types.js"

type ModelsOfKind<C extends SiteConfig, K extends Model["kind"]> = {
  [M in keyof C["models"]]: C["models"][M]["kind"] extends K ? M : never
}[keyof C["models"]] &
  string

export type SingletonKey<C extends SiteConfig> = ModelsOfKind<C, "singleton">
export type CollectionKey<C extends SiteConfig> = ModelsOfKind<C, "collection">
export type ModelData<
  C extends SiteConfig,
  K extends keyof C["models"],
> = InferModel<C["models"][K]>

/**
 * A published singleton. `data` is null until it's first published.
 * Fields added after publishing read as null even when `required`.
 */
export type SingletonContent<D> = {
  data: D | null
  publishedAt: string | null
}

export type CollectionEntry<D> = {
  id: string
  data: D
  publishedAt: string | null
}

export type ListOptions = {
  /** 1–200, default 50. Entries are ordered newest-published first. */
  limit?: number
  offset?: number
}

export type ClientOptions = {
  /** Base URL of the CMS, e.g. https://cms.example.com */
  url: string
  /** Read-scoped API key (am_read_…). Keep it server-side. */
  readKey: string
  fetch?: typeof fetch
  /** Merged into every request, e.g. Next.js `{ next: { tags: ["aramend"] } }`. */
  fetchOptions?: RequestInit
}

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
}

export class AramendError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = "AramendError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export type AramendClient<C extends SiteConfig> = {
  getSingleton<K extends SingletonKey<C>>(
    model: K,
    init?: RequestInit,
  ): Promise<SingletonContent<ModelData<C, K>>>
  getCollection<K extends CollectionKey<C>>(
    model: K,
    options?: ListOptions,
    init?: RequestInit,
  ): Promise<CollectionEntry<ModelData<C, K>>[]>
  /** Resolves null when the entry doesn't exist or isn't published. */
  getEntry<K extends CollectionKey<C>>(
    model: K,
    id: string,
    init?: RequestInit,
  ): Promise<CollectionEntry<ModelData<C, K>> | null>
}

type WireSingleton = {
  kind: "singleton"
  data: unknown
  publishedAt: string | null
}
type WireCollection = { kind: "collection"; items: CollectionEntry<unknown>[] }

/** Pass the site config as a type argument: `createClient<typeof config>({...})`. */
export function createClient<C extends SiteConfig>(
  options: ClientOptions,
): AramendClient<C> {
  const base = `${options.url.replace(/\/+$/, "")}/api/v1/content`
  const doFetch = options.fetch ?? globalThis.fetch

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${base}/${path}`
    const headers = new Headers(options.fetchOptions?.headers)
    for (const [k, v] of new Headers(init?.headers)) headers.set(k, v)
    headers.set("authorization", `Bearer ${options.readKey}`)
    headers.set("accept", "application/json")

    let res: Response
    try {
      res = await doFetch(url, {
        ...options.fetchOptions,
        ...init,
        headers,
      })
    } catch (cause) {
      throw new AramendError(
        0,
        "network_error",
        `[aramend/client] request to ${url} failed`,
        cause,
      )
    }

    if (res.ok) return (await res.json()) as T
    throw await toError(res, url)
  }

  return {
    async getSingleton(model, init) {
      const body = await request<WireSingleton | WireCollection>(
        encodeURIComponent(model),
        init,
      )
      if (body.kind !== "singleton")
        throw new AramendError(
          400,
          "wrong_kind",
          `[aramend/client] "${model}" is a ${body.kind}, not a singleton`,
        )
      return { data: body.data, publishedAt: body.publishedAt } as never
    },

    async getCollection(model, list, init) {
      const params = new URLSearchParams()
      if (list?.limit !== undefined) params.set("limit", String(list.limit))
      if (list?.offset !== undefined) params.set("offset", String(list.offset))
      const query = params.size ? `?${params}` : ""
      const body = await request<WireSingleton | WireCollection>(
        `${encodeURIComponent(model)}${query}`,
        init,
      )
      if (body.kind !== "collection")
        throw new AramendError(
          400,
          "wrong_kind",
          `[aramend/client] "${model}" is a ${body.kind}, not a collection`,
        )
      return body.items as never
    },

    async getEntry(model, id, init) {
      try {
        return await request(
          `${encodeURIComponent(model)}/${encodeURIComponent(id)}`,
          init,
        )
      } catch (error) {
        if (error instanceof AramendError && error.status === 404) return null
        throw error
      }
    },
  }
}

async function toError(res: Response, url: string): Promise<AramendError> {
  const text = await res.text().catch(() => "")
  try {
    const { error } = JSON.parse(text) as ApiErrorBody
    return new AramendError(
      res.status,
      error.code,
      `[aramend/client] ${error.message}`,
      error.details,
    )
  } catch {
    return new AramendError(
      res.status,
      "http_error",
      `[aramend/client] ${res.status} ${res.statusText} from ${url}`,
      text,
    )
  }
}
