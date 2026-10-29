export interface MemorySample {
  at: number;
  rss: number;
  heapUsed: number;
  external: number;
}

export interface MemoryGuardOptions {
  maxRssBytes: number;
  maxRssConsecutive: number;
  leakWindow: number;
  leakGrowthBytes: number;
  leakHeapGrowthBytes: number;
  leakMinimumRssBytes: number;
  monotonicRatio: number;
}

export interface MemoryGuardDecision {
  restart: boolean;
  reason?: string;
  details?: Record<string, number>;
}

const MIB = 1024 * 1024;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Conservative leak detector. It requires sustained growth across a full
 * sample window, not a single allocation spike. Absolute RSS protection is
 * evaluated independently and requires repeated breaches.
 */
export class MemoryGuard {
  private samples: MemorySample[] = [];
  private overLimitCount = 0;

  constructor(private readonly options: MemoryGuardOptions) {}

  observe(sample: MemorySample): MemoryGuardDecision {
    if (sample.rss >= this.options.maxRssBytes) this.overLimitCount += 1;
    else this.overLimitCount = 0;

    if (this.overLimitCount >= this.options.maxRssConsecutive) {
      return {
        restart: true,
        reason: `RSS stayed above ${Math.round(this.options.maxRssBytes / MIB)} MiB`,
        details: {
          rssBytes: sample.rss,
          heapUsedBytes: sample.heapUsed,
          consecutive: this.overLimitCount,
        },
      };
    }

    this.samples.push(sample);
    if (this.samples.length > this.options.leakWindow) this.samples.shift();
    if (this.samples.length < this.options.leakWindow) return { restart: false };

    const third = Math.max(1, Math.floor(this.samples.length / 3));
    const first = this.samples.slice(0, third);
    const last = this.samples.slice(-third);
    const firstRss = median(first.map((entry) => entry.rss));
    const lastRss = median(last.map((entry) => entry.rss));
    const firstHeap = median(first.map((entry) => entry.heapUsed));
    const lastHeap = median(last.map((entry) => entry.heapUsed));
    const rssGrowth = lastRss - firstRss;
    const heapGrowth = lastHeap - firstHeap;
    let positiveSteps = 0;
    for (let i = 1; i < this.samples.length; i += 1) {
      // Ignore sub-megabyte noise from allocator bookkeeping.
      if (this.samples[i].rss - this.samples[i - 1].rss >= MIB) positiveSteps += 1;
    }
    const ratio = positiveSteps / Math.max(1, this.samples.length - 1);
    const sustained = ratio >= this.options.monotonicRatio;
    const largeRssOnlyGrowth = rssGrowth >= this.options.leakGrowthBytes * 1.5;
    const correlatedHeapGrowth = heapGrowth >= this.options.leakHeapGrowthBytes;

    if (
      lastRss >= this.options.leakMinimumRssBytes &&
      sustained &&
      rssGrowth >= this.options.leakGrowthBytes &&
      (correlatedHeapGrowth || largeRssOnlyGrowth)
    ) {
      return {
        restart: true,
        reason: `sustained memory growth detected over ${this.samples.length} samples`,
        details: {
          rssGrowthBytes: rssGrowth,
          heapGrowthBytes: heapGrowth,
          positiveStepRatio: ratio,
          rssBytes: sample.rss,
        },
      };
    }

    return { restart: false };
  }

  snapshot(): MemorySample[] {
    return this.samples.map((sample) => ({ ...sample }));
  }
}

export function envNumber(name: string, fallback: number, minimum = 0): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}
