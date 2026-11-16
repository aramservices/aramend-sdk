import { isTimezone } from "./timezones.js"
import type { Field, FieldMap, TableColumn } from "./types.js"

export type ValidationError = { path: string; message: string }
export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validates entry data against a field map. Unknown keys are dropped from the result. */
export function validateEntry(
  fields: FieldMap,
  data: unknown,
): ValidationResult {
  const errors: ValidationError[] = []
  const value = validateFieldMap(fields, data, "", errors)
  return errors.length ? { ok: false, errors } : { ok: true, value }
}

function validateFieldMap(
  fields: FieldMap,
  data: unknown,
  path: string,
  errors: ValidationError[],
): Record<string, unknown> {
  if (!isRecord(data)) {
    errors.push({ path: path || "$", message: "Expected an object" })
    return {}
  }
  const out: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    out[key] = validateField(field, data[key], joinPath(path, key), errors)
  }
  return out
}

function validateField(
  field: Field,
  raw: unknown,
  path: string,
  errors: ValidationError[],
): unknown {
  if (raw === undefined || raw === null || raw === "") {
    if (field.required) errors.push({ path, message: "Required" })
    return null
  }
  const fail = (message: string) => {
    errors.push({ path, message })
    return null
  }

  switch (field.type) {
    case "text":
      if (typeof raw !== "string") return fail("Expected text")
      if (field.maxLength !== undefined && raw.length > field.maxLength)
        return fail(`Must be at most ${field.maxLength} characters`)
      return raw
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw))
        return fail("Expected a number")
      if (field.integer && !Number.isInteger(raw))
        return fail("Expected a whole number")
      if (field.min !== undefined && raw < field.min)
        return fail(`Must be ≥ ${field.min}`)
      if (field.max !== undefined && raw > field.max)
        return fail(`Must be ≤ ${field.max}`)
      return raw
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : fail("Expected true/false")
    case "date":
      return typeof raw === "string" && DATE_RE.test(raw)
        ? raw
        : fail("Expected a date (YYYY-MM-DD)")
    case "select":
      return typeof raw === "string" &&
        field.options.some((o) => o.value === raw)
        ? raw
        : fail("Not one of the allowed options")
    case "timezone":
      return typeof raw === "string" && isTimezone(raw)
        ? raw
        : fail("Not a valid IANA timezone")
    case "table": {
      if (!Array.isArray(raw)) return fail("Expected a list of rows")
      if (field.maxRows !== undefined && raw.length > field.maxRows)
        return fail(`At most ${field.maxRows} rows`)
      return raw.map((row, i) =>
        validateRow(field.columns, row, `${path}[${i}]`, errors),
      )
    }
    case "image":
    case "file": {
      // Only the reference is trusted from input; the server replaces it with the
      // canonical asset (url, size, …) in lib/assets.ts before storing.
      if (!isRecord(raw) || typeof raw.assetId !== "string" || !raw.assetId)
        return fail("Expected an uploaded file")
      if (field.type === "file") return { assetId: raw.assetId }
      const alt = typeof raw.alt === "string" ? raw.alt.slice(0, 500) : ""
      return { assetId: raw.assetId, alt }
    }
    case "group":
      return validateFieldMap(field.fields, raw, path, errors)
    case "repeater": {
      if (!Array.isArray(raw)) return fail("Expected a list")
      if (field.maxItems !== undefined && raw.length > field.maxItems)
        return fail(`At most ${field.maxItems} items`)
      return raw.map((item, i) =>
        validateFieldMap(field.fields, item, `${path}[${i}]`, errors),
      )
    }
  }
}

function validateRow(
  columns: readonly TableColumn[],
  row: unknown,
  path: string,
  errors: ValidationError[],
): Record<string, unknown> {
  if (!isRecord(row)) {
    errors.push({ path, message: "Expected a row object" })
    return {}
  }
  const out: Record<string, unknown> = {}
  for (const col of columns) {
    // Table cells are always optional; reuse field validation by shaping the column as a field.
    const asField: Field =
      col.type === "select"
        ? { type: "select", options: col.options ?? [] }
        : { type: col.type }
    out[col.key] = validateField(
      asField,
      row[col.key],
      `${path}.${col.key}`,
      errors,
    )
  }
  return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key
}
