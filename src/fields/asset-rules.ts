import type { FileField, ImageField } from "./types.js"

// SVG is excluded: it can carry scripts and is served from a public bucket.
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const

const DEFAULT_IMAGE_MB = 10
const DEFAULT_FILE_MB = 25

export type UploadLimits = {
  accept: readonly string[] | null
  maxBytes: number
}

export function getUploadLimits(field: ImageField | FileField): UploadLimits {
  if (field.type === "image")
    return {
      accept: IMAGE_TYPES,
      maxBytes: (field.maxSizeMb ?? DEFAULT_IMAGE_MB) * 1024 * 1024,
    }
  return {
    accept: field.accept?.length ? field.accept : null,
    maxBytes: (field.maxSizeMb ?? DEFAULT_FILE_MB) * 1024 * 1024,
  }
}

/** Returns an error message, or null if the upload is allowed. */
export function checkUpload(
  field: ImageField | FileField,
  contentType: string,
  size: number,
): string | null {
  const { accept, maxBytes } = getUploadLimits(field)
  if (accept && !accept.includes(contentType))
    return `File type ${contentType || "unknown"} isn't allowed here`
  if (!Number.isFinite(size) || size <= 0) return "File is empty"
  if (size > maxBytes)
    return `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`
  return null
}
