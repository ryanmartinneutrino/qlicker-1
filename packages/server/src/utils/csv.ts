import type { Response } from 'express'

function quoteCsvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map((value) => quoteCsvCell(value)).join(',')).join('\n')
}

export function sendCsvDownload(
  res: Response,
  fileName: string,
  rows: Array<Array<unknown>>
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.send(toCsv(rows))
}
