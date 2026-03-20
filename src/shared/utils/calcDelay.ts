export function calcDelay(scheduledAt: Date | string): number {
  const delay = new Date(scheduledAt).getTime() - Date.now()
  if (delay < 0) return 0
  return delay
}
