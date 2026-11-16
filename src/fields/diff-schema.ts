import type { Field, FieldMap, SiteConfig } from "./types.js"

export type BreakingChange = { path: string; reason: string }

/**
 * Lists changes that would orphan or misinterpret existing content.
 * Additive changes (new models/fields/options) are not breaking.
 */
export function diffSchemas(
  prev: SiteConfig,
  next: SiteConfig,
): BreakingChange[] {
  const changes: BreakingChange[] = []
  for (const [key, model] of Object.entries(prev.models)) {
    const nextModel = next.models[key]
    const path = `models.${key}`
    if (!nextModel) changes.push({ path, reason: "model removed" })
    else if (nextModel.kind !== model.kind)
      changes.push({
        path,
        reason: `kind changed ${model.kind} → ${nextModel.kind}`,
      })
    else
      diffFieldMaps(model.fields, nextModel.fields, `${path}.fields`, changes)
  }
  return changes
}

function diffFieldMaps(
  prev: FieldMap,
  next: FieldMap,
  path: string,
  changes: BreakingChange[],
): void {
  for (const [key, field] of Object.entries(prev)) {
    const nextField = next[key]
    const p = `${path}.${key}`
    if (!nextField) changes.push({ path: p, reason: "field removed" })
    else diffField(field, nextField, p, changes)
  }
}

function diffField(
  prev: Field,
  next: Field,
  path: string,
  changes: BreakingChange[],
): void {
  if (prev.type !== next.type) {
    changes.push({
      path,
      reason: `type changed ${prev.type} → ${next.type}`,
    })
    return
  }

  if (prev.type === "select" && next.type === "select") {
    for (const opt of prev.options)
      if (!next.options.some((o) => o.value === opt.value))
        changes.push({ path, reason: `option "${opt.value}" removed` })
  }
  if (prev.type === "table" && next.type === "table") {
    for (const col of prev.columns) {
      const nextCol = next.columns.find((c) => c.key === col.key)
      if (!nextCol)
        changes.push({ path: `${path}.${col.key}`, reason: "column removed" })
      else if (nextCol.type !== col.type)
        changes.push({
          path: `${path}.${col.key}`,
          reason: `column type changed ${col.type} → ${nextCol.type}`,
        })
    }
  }
  if (
    (prev.type === "group" || prev.type === "repeater") &&
    prev.type === next.type
  ) {
    diffFieldMaps(
      prev.fields,
      (next as typeof prev).fields,
      `${path}.fields`,
      changes,
    )
  }
}
