const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtcMs(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(toUtcMs(value));
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function addDays(isoDate, days) {
  return new Date(toUtcMs(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / DAY_MS);
}

// Periods are inclusive: 01.10–01.10 is one day.
export function periodLength(startIso, endIso) {
  return daysBetween(startIso, endIso) + 1;
}

export function overlapDays(aStart, aEnd, bStart, bEnd) {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return start > end ? 0 : periodLength(start, end);
}

export function localIsoDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatRu(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

export function formatRangeRu(startIso, endIso) {
  return startIso === endIso ? formatRu(startIso) : `${formatRu(startIso)}–${formatRu(endIso)}`;
}
