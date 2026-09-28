import { localIsoDate } from './dates.js';

export function systemClock() {
  return {
    today: () => localIsoDate(new Date()),
    now: () => new Date().toISOString(),
  };
}

export function fixedClock(today, time = '10:00:00') {
  return {
    today: () => today,
    now: () => `${today}T${time}.000Z`,
  };
}
