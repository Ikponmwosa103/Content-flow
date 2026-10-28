export function currentPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function currentPeriodEnd(now = new Date()): string {
  const firstOfNextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return `${firstOfNextMonth.getUTCFullYear()}-${String(firstOfNextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
