function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map((value) => escapeCell(value)).join(',')).join('\n')
}

export function downloadCsvFile(filename: string, rows: Array<Array<unknown>>): void {
  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
