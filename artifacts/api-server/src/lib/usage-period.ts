/** UTC anniversary-based usage periods. The anchor day is clamped to the last
 * valid day in shorter months (e.g. Jan 31 -> Feb 28/29 -> Mar 31).
 * Period keys are UTC dates because contentflow_usage.period_start is a DATE.
 */
export function monthlyAnniversary(anchor: Date, monthOffset: number): Date {
  const targetMonthIndex = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + monthOffset;
  const year = Math.floor(targetMonthIndex / 12);
  const month = targetMonthIndex - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year, month, Math.min(anchor.getUTCDate(), lastDay),
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
  ));
}

export function currentPeriodStart(anchor: Date, now = new Date()): string {
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError("A valid usage-period anchor and current date are required");
  }
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() - anchor.getUTCMonth();
  let start = monthlyAnniversary(anchor, months);
  if (start.getTime() > now.getTime()) {
    months -= 1;
    start = monthlyAnniversary(anchor, months);
  }
  return start.toISOString().slice(0, 10);
}

export function currentPeriodEnd(anchor: Date, now = new Date()): string {
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError("A valid usage-period anchor and current date are required");
  }
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() - anchor.getUTCMonth();
  const thisMonthAnniversary = monthlyAnniversary(anchor, months);
  if (thisMonthAnniversary.getTime() > now.getTime()) months -= 1;
  return monthlyAnniversary(anchor, months + 1).toISOString().slice(0, 10);
}

export function nextPeriodBoundary(anchor: Date, now = new Date()): Date {
  const end = currentPeriodEnd(anchor, now);
  return new Date(`${end}T00:00:00.000Z`);
}
