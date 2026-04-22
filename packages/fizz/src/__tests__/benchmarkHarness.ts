import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { performance } from "node:perf_hooks"

type BenchmarkOptions = {
  iterations: number
  warmupIterations: number
}

type Percentiles = {
  p50: number
  p95: number
  p99: number
}

export type BenchmarkResult = {
  name: string
  iterations: number
  meanMs: number
  minMs: number
  maxMs: number
} & Percentiles

type BenchmarkSnapshot = {
  generatedAt: string
  results: BenchmarkResult[]
  suite: string
}

let benchmarkResults: BenchmarkResult[] = []

const round = (value: number) => Number(value.toFixed(3))

const percentileIndex = (sampleCount: number, percentile: number) =>
  Math.min(
    sampleCount - 1,
    Math.max(0, Math.ceil((sampleCount * percentile) / 100) - 1),
  )

const summarizeSamples = (
  samples: number[],
): Omit<BenchmarkResult, "name" | "iterations"> => {
  const sorted = [...samples].sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  const count = sorted.length

  return {
    maxMs: round(sorted[count - 1] ?? 0),
    meanMs: round(total / count),
    minMs: round(sorted[0] ?? 0),
    p50: round(sorted[percentileIndex(count, 50)] ?? 0),
    p95: round(sorted[percentileIndex(count, 95)] ?? 0),
    p99: round(sorted[percentileIndex(count, 99)] ?? 0),
  }
}

const writeResult = (result: BenchmarkResult) => {
  process.stdout.write(
    `[perf] ${result.name} :: n=${result.iterations} mean=${result.meanMs}ms p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms min=${result.minMs}ms max=${result.maxMs}ms\n`,
  )
}

const measureIteration = async (run: () => Promise<void> | void) => {
  const start = performance.now()

  await run()

  return performance.now() - start
}

export const benchmark = async (
  name: string,
  run: () => Promise<void> | void,
  options: BenchmarkOptions,
): Promise<BenchmarkResult> => {
  const { iterations, warmupIterations } = options

  for (let index = 0; index < warmupIterations; index += 1) {
    await run()
  }

  const samples: number[] = []

  for (let index = 0; index < iterations; index += 1) {
    const elapsed = await measureIteration(run)
    samples.push(elapsed)
  }

  const result = {
    iterations,
    name,
    ...summarizeSamples(samples),
  }

  writeResult(result)
  benchmarkResults.push(result)

  return result
}

export const writeBenchmarkSnapshot = (suite: string): void => {
  const outputPath = process.env.FIZZ_BENCHMARK_OUTPUT

  if (!outputPath) {
    return
  }

  const previousPath = `${outputPath}.previous`
  const snapshot: BenchmarkSnapshot = {
    generatedAt: new Date().toISOString(),
    results: [...benchmarkResults].sort((a, b) => a.name.localeCompare(b.name)),
    suite,
  }

  mkdirSync(dirname(outputPath), {
    recursive: true,
  })

  if (existsSync(outputPath)) {
    copyFileSync(outputPath, previousPath)
  }

  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2))
  benchmarkResults = []
}
