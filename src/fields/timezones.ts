let cached: Set<string> | null = null

export function getTimezones(): string[] {
  return [...getTimezoneSet()]
}

export function isTimezone(value: string): boolean {
  return getTimezoneSet().has(value)
}

function getTimezoneSet(): Set<string> {
  if (!cached) {
    // Some engines omit "UTC" from supportedValuesOf; it's always valid.
    cached = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")])
  }
  return cached
}
