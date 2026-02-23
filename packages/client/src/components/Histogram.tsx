interface HistogramProps {
  values: number[]
  buckets?: number
}

export function Histogram({ values, buckets = 8 }: HistogramProps) {
  if (values.length === 0) return <p style={{ marginTop: '0.5rem' }}>No numerical responses submitted.</p>

  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const binSize = spread / buckets
  const counts = Array.from({ length: buckets }, () => 0)

  values.forEach((value) => {
    const raw = Math.floor((value - min) / binSize)
    const bucket = Math.max(0, Math.min(buckets - 1, raw))
    counts[bucket] += 1
  })

  const maxCount = Math.max(...counts, 1)

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {counts.map((count, index) => {
        const bucketMin = min + index * binSize
        const bucketMax = bucketMin + binSize
        const widthPct = Math.round((count / maxCount) * 100)
        return (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 46px', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
            <span>{bucketMin.toFixed(2)} - {bucketMax.toFixed(2)}</span>
            <div style={{ height: 8, width: `${widthPct}%`, background: '#30B0E7', borderRadius: 4 }} />
            <span>{count}</span>
          </div>
        )
      })}
    </div>
  )
}
