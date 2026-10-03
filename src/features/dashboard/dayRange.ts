export function getDayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return {
    from: start.toISOString(),
    to: new Date(next.getTime() - 1).toISOString(),
    nextMidnight: next.getTime(),
  };
}
