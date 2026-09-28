// SLA targets from the non-functional requirements (NFR-01…NFR-07).
export const SLA_TARGETS = {
  responseMs: 500,
  serviceWindow: '08:00–22:00',
  availabilityPercent: 99.0,
  notificationSeconds: 60,
  rightsChangeMinutes: 5,
  rpoHours: 24,
  rtoHours: 4,
  backupTime: '02:00',
  concurrentUsers: 100,
};

const DEFAULT_CAPACITY = 5000;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const round = (value) => Math.round(value * 10) / 10;

function summarize(samples, targetMs) {
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const withinTarget = durations.filter((duration) => duration <= targetMs).length;
  return {
    count: durations.length,
    p50: round(percentile(durations, 50)),
    p95: round(percentile(durations, 95)),
    p99: round(percentile(durations, 99)),
    max: round(durations.at(-1) ?? 0),
    withinTargetPercent: durations.length ? round((withinTarget / durations.length) * 100) : 100,
    serverErrors: samples.filter((sample) => sample.status >= 500).length,
  };
}

export function createMetrics({ capacity = DEFAULT_CAPACITY, now = Date.now } = {}) {
  const startedAt = now();
  let samples = [];
  let total = 0;

  return {
    record(route, durationMs, status) {
      total += 1;
      samples = [...samples.slice(-(capacity - 1)), { route, durationMs, status }];
    },
    snapshot() {
      const routes = [...new Set(samples.map((sample) => sample.route))]
        .map((route) => ({ route, ...summarize(samples.filter((sample) => sample.route === route), SLA_TARGETS.responseMs) }))
        .sort((a, b) => b.p95 - a.p95);
      const overall = summarize(samples, SLA_TARGETS.responseMs);
      return {
        startedAt: new Date(startedAt).toISOString(),
        uptimeSeconds: Math.round((now() - startedAt) / 1000),
        totalRequests: total,
        availabilityPercent: overall.count ? round(100 - (overall.serverErrors / overall.count) * 100) : 100,
        overall,
        routes,
        targets: SLA_TARGETS,
      };
    },
  };
}
