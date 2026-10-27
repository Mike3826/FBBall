export function toMondaySundayPeriods<T extends { number: number; startDate: string; endDate: string }>(
  periods: T[],
): T[];
