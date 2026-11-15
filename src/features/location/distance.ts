// Distances are shown to players in miles.

const METRES_PER_MILE = 1609.344;

export function metresToMiles(metres: number): number {
  return metres / METRES_PER_MILE;
}

/** "6.4 mi" under ten miles, otherwise whole miles with thousands separators: "1,204 mi". */
export function formatMiles(metres: number): string {
  const miles = Math.max(0, metresToMiles(metres));
  if (!Number.isFinite(miles)) return '0 mi';
  if (miles < 9.95) return `${miles.toFixed(1)} mi`;
  const whole = Math.round(miles);
  return `${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} mi`;
}
