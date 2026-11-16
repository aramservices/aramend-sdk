import type { FieldMap, FileField, ImageField } from "./types.js"

export type AssetFieldVisitor = (
  field: ImageField | FileField,
  value: Record<string, unknown>,
  path: string,
) => unknown

/**
 * Returns a copy of validated entry data with every image/file value replaced by
 * the visitor's result. Paths match validate-entry.ts. Tables can't hold assets.
 */
export function mapAssetValues(
  fields: FieldMap,
  data: Record<string, unknown>,
  visit: AssetFieldVisitor,
  path = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const [key, field] of Object.entries(fields)) {
    const value = data[key]
    const p = path ? `${path}.${key}` : key
    if (value === null || value === undefined) continue

    if ((field.type === "image" || field.type === "file") && isRecord(value))
      out[key] = visit(field, value, p)
    else if (field.type === "group" && isRecord(value))
      out[key] = mapAssetValues(field.fields, value, visit, p)
    else if (field.type === "repeater" && Array.isArray(value))
      out[key] = value.map((item, i) =>
        isRecord(item)
          ? mapAssetValues(field.fields, item, visit, `${p}[${i}]`)
          : item,
      )
  }
  return out
}

export function collectAssetIds(
  fields: FieldMap,
  data: Record<string, unknown>,
): string[] {
  const ids = new Set<string>()
  mapAssetValues(fields, data, (_field, value) => {
    if (typeof value.assetId === "string") ids.add(value.assetId)
    return value
  })
  return [...ids]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
