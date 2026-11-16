// Field + site config definitions. Framework-free; shared by the CMS and site code.

type BaseField = {
  label?: string
  description?: string
  required?: boolean
}

export type TextField = BaseField & {
  type: "text"
  multiline?: boolean
  maxLength?: number
}
export type NumberField = BaseField & {
  type: "number"
  min?: number
  max?: number
  integer?: boolean
}
export type BooleanField = BaseField & { type: "boolean" }
export type DateField = BaseField & { type: "date" }

export type SelectOption = { value: string; label?: string }
export type SelectField = BaseField & {
  type: "select"
  options: readonly SelectOption[]
}

export type TimezoneField = BaseField & { type: "timezone" }

export type TableColumnType = "text" | "number" | "boolean" | "date" | "select"
export type TableColumn = {
  key: string
  label?: string
  type: TableColumnType
  options?: readonly SelectOption[]
}
export type TableField = BaseField & {
  type: "table"
  columns: readonly TableColumn[]
  maxRows?: number
}

/** Images: jpeg, png, webp, gif, avif. Default max 10 MB. */
export type ImageField = BaseField & { type: "image"; maxSizeMb?: number }
/** Any file, optionally restricted to MIME types. Default max 25 MB. */
export type FileField = BaseField & {
  type: "file"
  accept?: readonly string[]
  maxSizeMb?: number
}

/** Stored and served shape of a file field. Filled in by the server from the asset row. */
export type AssetValue = {
  assetId: string
  url: string
  filename: string
  contentType: string
  size: number
}
export type ImageValue = AssetValue & {
  width: number | null
  height: number | null
  alt: string
}

export type GroupField = BaseField & { type: "group"; fields: FieldMap }
export type RepeaterField = BaseField & {
  type: "repeater"
  fields: FieldMap
  maxItems?: number
}

export type Field =
  | TextField
  | NumberField
  | BooleanField
  | DateField
  | SelectField
  | TimezoneField
  | TableField
  | ImageField
  | FileField
  | GroupField
  | RepeaterField

export type FieldType = Field["type"]
export type FieldMap = { readonly [key: string]: Field }

export type SingletonModel = {
  kind: "singleton"
  label?: string
  fields: FieldMap
}
export type CollectionModel = {
  kind: "collection"
  label?: string
  titleField?: string
  fields: FieldMap
}
export type Model = SingletonModel | CollectionModel

export type SiteConfig = {
  /** Site slug, must match the site registered in the CMS. */
  site: string
  models: { readonly [key: string]: Model }
}

// ---- Value inference (used by site code via the SDK) ----

type ColumnValue<C extends TableColumn> = C["type"] extends "number"
  ? number
  : C["type"] extends "boolean"
    ? boolean
    : C["type"] extends "select"
      ? NonNullable<C["options"]>[number]["value"]
      : string

export type TableRow<F extends TableField> = {
  [C in F["columns"][number] as C["key"]]: ColumnValue<C> | null
}

type RawValue<F extends Field> = F extends TextField | DateField | TimezoneField
  ? string
  : F extends NumberField
    ? number
    : F extends BooleanField
      ? boolean
      : F extends SelectField
        ? F["options"][number]["value"]
        : F extends TableField
          ? TableRow<F>[]
          : F extends ImageField
            ? ImageValue
            : F extends FileField
              ? AssetValue
              : F extends GroupField
                ? InferFields<F["fields"]>
                : F extends RepeaterField
                  ? InferFields<F["fields"]>[]
                  : never

export type FieldValue<F extends Field> = F["required"] extends true
  ? RawValue<F>
  : RawValue<F> | null

export type InferFields<M extends FieldMap> = {
  [K in keyof M]: FieldValue<M[K]>
}
export type InferModel<M extends Model> = InferFields<M["fields"]>
