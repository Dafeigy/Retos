import type { ComponentItem } from "@/lib/inventory-types"

export type BomRow = {
  id: string
  number: string
  quantity: number
  comment: string
  designator: string
  footprint: string
  value: string
  manufacturerPart: string
  manufacturer: string
  supplierPart: string
  supplier: string
}

export type BomMatchStatus = "unmatched" | "ready" | "short" | "untracked-ready" | "untracked-short"

export type BomMatch = {
  row: BomRow
  items: ComponentItem[]
  stock: number
  status: BomMatchStatus
}

type PassiveKind = "resistor" | "capacitor"

export function decodeBomFile(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2))
  return new TextDecoder("utf-8").decode(bytes)
}

const EXPECTED_HEADERS = {
  number: ["no.", "no", "序号"],
  quantity: ["quantity", "qty", "数量"],
  comment: ["comment", "评论", "型号"],
  designator: ["designator", "reference", "位号"],
  footprint: ["footprint", "package", "封装"],
  value: ["value", "值"],
  manufacturerPart: ["manufacturer part", "mpn", "制造商料号"],
  manufacturer: ["manufacturer", "制造商"],
  supplierPart: ["supplier part", "supplier part number", "供应商货号", "货号"],
  supplier: ["supplier", "供应商"],
} as const

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase()
}

function delimiterFor(text: string) {
  const header = text.split(/\r?\n/, 1)[0] ?? ""
  const choices = [",", "\t", ";"]
  return choices.reduce((best, candidate) => header.split(candidate).length > header.split(best).length ? candidate : best)
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      row.push(field)
      field = ""
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

export function parseBomCsv(text: string): BomRow[] {
  const records = parseDelimited(text, delimiterFor(text))
  if (records.length < 2) throw new Error("CSV 中没有可读取的 BOM 数据。")

  const headers = records[0].map(normalizedHeader)
  const column = (aliases: readonly string[]) => headers.findIndex((header) => aliases.includes(header))
  const columns = Object.fromEntries(Object.entries(EXPECTED_HEADERS).map(([key, aliases]) => [key, column(aliases)])) as Record<keyof typeof EXPECTED_HEADERS, number>
  if (columns.quantity < 0 || columns.comment < 0) {
    throw new Error("CSV 至少需要包含 Quantity 和 Comment 列。")
  }
  const read = (record: string[], key: keyof typeof EXPECTED_HEADERS) => columns[key] < 0 ? "" : (record[columns[key]] ?? "").trim()

  return records.slice(1).map((record, index) => {
    const quantity = Number.parseInt(read(record, "quantity"), 10)
    return {
      id: `${index + 1}-${read(record, "number") || index + 1}`,
      number: read(record, "number") || String(index + 1),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      comment: read(record, "comment"),
      designator: read(record, "designator"),
      footprint: read(record, "footprint"),
      value: read(record, "value"),
      manufacturerPart: read(record, "manufacturerPart"),
      manufacturer: read(record, "manufacturer"),
      supplierPart: read(record, "supplierPart"),
      supplier: read(record, "supplier"),
    }
  }).filter((row) => row.comment || row.designator || row.footprint)
}

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function itemKind(item: ComponentItem): PassiveKind | null {
  const category = normalizedText(item.category)
  const footprint = item.package.trim().toUpperCase().replace(/[\s_-]+/g, "")
  if (category.includes("电阻") || category.includes("resistor") || /^RES\d/.test(footprint)) return "resistor"
  if (category.includes("电容") || category.includes("capacitor") || /^CAP\d/.test(footprint)) return "capacitor"
  return null
}

function rowKind(row: BomRow): PassiveKind | null {
  const footprint = row.footprint.trim().toUpperCase().replace(/[\s_-]+/g, "")
  const designators = row.designator.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
  const value = `${row.comment} ${row.value}`.replace(/[μµ]/g, "u")
  if (/^(?:RES|R)\d{4}/.test(footprint) || (designators.length > 0 && designators.every((value) => /^R\d/.test(value)))) return "resistor"
  if (/^(?:CAP|C)\d{4}/.test(footprint) || (designators.length > 0 && designators.every((value) => /^C\d/.test(value))) || /\d\s*[pnum]f\b/i.test(value)) return "capacitor"
  return null
}

function normalizedFootprint(value: string, kind: PassiveKind | null) {
  let normalized = value.trim().toUpperCase().replace(/[\s_-]+/g, "")
  if (kind === "resistor") normalized = normalized.replace(/^RES/, "").replace(/^R(?=\d{4}$)/, "")
  if (kind === "capacitor") normalized = normalized.replace(/^CAP/, "").replace(/^C(?=\d{4}$)/, "")
  return normalized
}

function canonicalNumber(value: number) {
  return Number(value.toPrecision(12)).toString()
}

function normalizedElectricalValue(value: string, kind: PassiveKind) {
  const raw = value.replace(/[μµ]/g, "u").replace(/Ω/gi, "ohm").trim()
  if (kind === "capacitor") {
    const match = raw.match(/(\d+(?:\.\d+)?)\s*([pnum]?)\s*f\b/i) ?? raw.match(/^(\d+(?:\.\d+)?)\s*([pnu])$/i)
    if (!match) return normalizedText(value).replace(/\s+/g, "")
    const multiplier: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, "": 1 }
    return `c:${canonicalNumber(Number(match[1]) * multiplier[match[2].toLowerCase()])}`
  }

  const embedded = raw.match(/\b(\d+)([RrKkMm])(\d+)\b/)
  if (embedded) {
    const multiplier = embedded[2].toLowerCase() === "r" ? 1 : embedded[2].toLowerCase() === "k" ? 1e3 : 1e6
    return `r:${canonicalNumber(Number(`${embedded[1]}.${embedded[3]}`) * multiplier)}`
  }
  const match = raw.match(/(\d+(?:\.\d+)?)\s*([rRkKmM]?)\s*(?:ohm)?\b/)
  if (!match) return normalizedText(value).replace(/\s+/g, "")
  const suffix = match[2].toLowerCase()
  const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1
  return `r:${canonicalNumber(Number(match[1]) * multiplier)}`
}

function valueMatches(value: string, item: ComponentItem, kind: PassiveKind | null) {
  if (!value.trim()) return true
  if (kind && itemKind(item) === kind) return normalizedElectricalValue(value, kind) === normalizedElectricalValue(item.value, kind)
  return normalizedText(value) === normalizedText(item.value)
}

function primaryMatches(row: BomRow, item: ComponentItem, kind: PassiveKind | null) {
  if (normalizedText(row.comment) === normalizedText(item.name)) return true
  return Boolean(kind && itemKind(item) === kind && valueMatches(row.comment, item, kind))
}

export function matchBomRow(row: BomRow, items: ComponentItem[]): BomMatch {
  const kind = rowKind(row)
  let candidates = items.filter((item) => primaryMatches(row, item, kind))

  if (candidates.length > 1 && row.footprint.trim()) {
    const footprint = normalizedFootprint(row.footprint, kind)
    candidates = candidates.filter((item) => normalizedFootprint(item.package, kind) === footprint)
  }
  if (candidates.length > 1 && row.value.trim()) {
    candidates = candidates.filter((item) => valueMatches(row.value, item, kind))
  }

  const stock = candidates.reduce((sum, item) => sum + item.quantity, 0)
  if (candidates.length === 0) return { row, items: [], stock: 0, status: "unmatched" }
  const enough = stock >= row.quantity
  const hasPartNumber = Boolean(row.supplierPart.trim())
  const status: BomMatchStatus = hasPartNumber
    ? enough ? "ready" : "short"
    : enough ? "untracked-ready" : "untracked-short"
  return { row, items: candidates, stock, status }
}

export function matchBomRows(rows: BomRow[], items: ComponentItem[]) {
  return rows.map((row) => matchBomRow(row, items))
}
