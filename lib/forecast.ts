/**
 * Simple linear regression forecast.
 * Given a time series of { period: 'YYYY-MM', value: number },
 * returns projected values for future periods.
 */

export interface TimePoint { period: string; value: number }

export function linearRegression(data: TimePoint[]): { slope: number; intercept: number } {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: data[0]?.value ?? 0 }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += data[i].value
    sumXY += i * data[i].value
    sumXX += i * i
  }
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export function addMonths(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function forecast(data: TimePoint[], monthsAhead: number): TimePoint[] {
  if (data.length < 2) return []
  const sorted = [...data].sort((a, b) => a.period.localeCompare(b.period))
  const { slope, intercept } = linearRegression(sorted)

  const n = sorted.length
  const lastPeriod = sorted[n - 1].period
  const result: TimePoint[] = []

  for (let i = 1; i <= monthsAhead; i++) {
    result.push({
      period: addMonths(lastPeriod, i),
      value: Math.round((intercept + slope * (n - 1 + i)) * 100) / 100,
    })
  }
  return result
}

/**
 * Seasonal forecast using simple moving average + seasonal index.
 * Requires at least 12 months of data for seasonality detection.
 */
export function seasonalForecast(data: TimePoint[], monthsAhead: number): TimePoint[] {
  const sorted = [...data].sort((a, b) => a.period.localeCompare(b.period))
  if (sorted.length < 12) return forecast(data, monthsAhead) // fallback to linear

  // Calculate monthly averages for seasonality
  const monthAvg: Record<number, number[]> = {}
  for (const d of sorted) {
    const m = parseInt(d.period.split('-')[1])
    if (!monthAvg[m]) monthAvg[m] = []
    monthAvg[m].push(d.value)
  }

  const overallAvg = sorted.reduce((s, d) => s + d.value, 0) / sorted.length
  const seasonalIndex: Record<number, number> = {}
  for (const [m, vals] of Object.entries(monthAvg)) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    seasonalIndex[Number(m)] = overallAvg !== 0 ? avg / overallAvg : 1
  }

  // Use linear trend + seasonal adjustment
  const { slope, intercept } = linearRegression(sorted)
  const n = sorted.length
  const lastPeriod = sorted[n - 1].period
  const result: TimePoint[] = []

  for (let i = 1; i <= monthsAhead; i++) {
    const nextPeriod = addMonths(lastPeriod, i)
    const month = parseInt(nextPeriod.split('-')[1])
    const trendValue = intercept + slope * (n - 1 + i)
    const seasonal = seasonalIndex[month] ?? 1
    result.push({
      period: nextPeriod,
      value: Math.round(trendValue * seasonal * 100) / 100,
    })
  }
  return result
}
