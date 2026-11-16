import type {
  Field,
  Model,
  SelectOption,
  SiteConfig,
  TableColumn,
} from "./types.js"

export type ParseConfigResult =
  | { ok: true; config: SiteConfig }
  | { ok: false; errors: string[] }

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const COLUMN_TYPES = new Set(["text", "number", "boolean", "date", "select"])
const MAX_DEPTH = 5

/** Structural check for a site config pushed over the wire (CLI → CMS). */
export function parseSiteConfig(input: unknown): ParseConfigResult {
  const errors: string[] = []
  if (!isRecord(input))
    return { ok: false, errors: ["Config must be an object"] }

  if (typeof input.site !== "string" || !SLUG_RE.test(input.site))
    errors.push("site: expected a slug")
  if (!isRecord(input.models)) {
    errors.push("models: expected an object")
    return { ok: false, errors }
  }

  for (const [key, model] of Object.entries(input.models)) {
    if (!KEY_RE.test(key)) errors.push(`models.${key}: invalid key`)
    checkModel(model, `models.${key}`, errors)
  }

  return errors.length
    ? { ok: false, errors }
    : { ok: true, config: input as SiteConfig }
}

function checkModel(model: unknown, path: string, errors: string[]): void {
  if (!isRecord(model)) {
    errors.push(`${path}: expected an object`)
    return
  }
  if (model.kind !== "singleton" && model.kind !== "collection")
    errors.push(`${path}.kind: expected "singleton" or "collection"`)
  checkOptionalString(model.label, `${path}.label`, errors)
  checkFieldMap(model.fields, `${path}.fields`, errors, 0)
  if (model.kind === "collection" && model.titleField !== undefined) {
    const fields = model.fields as Model["fields"] | undefined
    if (
      typeof model.titleField !== "string" ||
      fields?.[model.titleField]?.type !== "text"
    )
      errors.push(`${path}.titleField: must name a text field`)
  }
}

function checkFieldMap(
  fields: unknown,
  path: string,
  errors: string[],
  depth: number,
): void {
  if (!isRecord(fields)) {
    errors.push(`${path}: expected an object`)
    return
  }
  if (depth > MAX_DEPTH) {
    errors.push(`${path}: nested too deeply`)
    return
  }
  for (const [key, field] of Object.entries(fields)) {
    if (!KEY_RE.test(key)) errors.push(`${path}.${key}: invalid key`)
    checkField(field, `${path}.${key}`, errors, depth)
  }
}

function checkField(
  field: unknown,
  path: string,
  errors: string[],
  depth: number,
): void {
  if (!isRecord(field)) {
    errors.push(`${path}: expected an object`)
    return
  }
  checkOptionalString(field.label, `${path}.label`, errors)
  checkOptionalString(field.description, `${path}.description`, errors)
  if (field.required !== undefined && typeof field.required !== "boolean")
    errors.push(`${path}.required: expected boolean`)

  const type = field.type as Field["type"]
  switch (type) {
    case "text":
    case "number":
    case "boolean":
    case "date":
    case "timezone":
      return
    case "image":
    case "file":
      if (
        field.maxSizeMb !== undefined &&
        (typeof field.maxSizeMb !== "number" ||
          field.maxSizeMb <= 0 ||
          field.maxSizeMb > 100)
      )
        errors.push(`${path}.maxSizeMb: expected a number between 0 and 100`)
      if (
        type === "file" &&
        field.accept !== undefined &&
        (!Array.isArray(field.accept) ||
          !field.accept.every((t) => typeof t === "string" && t.includes("/")))
      )
        errors.push(
          `${path}.accept: expected MIME types like "application/pdf"`,
        )
      return
    case "select":
      checkOptions(field.options, `${path}.options`, errors)
      return
    case "table": {
      const cols = field.columns
      if (!Array.isArray(cols) || cols.length === 0) {
        errors.push(`${path}.columns: expected a non-empty array`)
        return
      }
      const seen = new Set<string>()
      for (const [i, col] of (cols as unknown[]).entries()) {
        const p = `${path}.columns[${i}]`
        if (!isRecord(col)) {
          errors.push(`${p}: expected an object`)
          continue
        }
        const c = col as Partial<TableColumn>
        if (typeof c.key !== "string" || !KEY_RE.test(c.key))
          errors.push(`${p}.key: invalid key`)
        else if (seen.has(c.key)) errors.push(`${p}.key: duplicate "${c.key}"`)
        else seen.add(c.key)
        if (typeof c.type !== "string" || !COLUMN_TYPES.has(c.type))
          errors.push(`${p}.type: invalid column type`)
        if (c.type === "select") checkOptions(c.options, `${p}.options`, errors)
      }
      return
    }
    case "group":
    case "repeater":
      checkFieldMap(field.fields, `${path}.fields`, errors, depth + 1)
      return
    default:
      errors.push(`${path}.type: unknown field type "${String(field.type)}"`)
  }
}

function checkOptions(options: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(options) || options.length === 0) {
    errors.push(`${path}: expected a non-empty array`)
    return
  }
  for (const [i, opt] of options.entries()) {
    const o = opt as Partial<SelectOption>
    if (!isRecord(opt) || typeof o.value !== "string")
      errors.push(`${path}[${i}].value: expected string`)
  }
}

function checkOptionalString(v: unknown, path: string, errors: string[]): void {
  if (v !== undefined && typeof v !== "string")
    errors.push(`${path}: expected string`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
