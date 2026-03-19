export function initAnalytics(): void {
  // no-op placeholder
}

export function trackEvent(name: string, params?: Record<string, string>): void {
  console.log(`[analytics] ${name}`, params ?? '');
}
