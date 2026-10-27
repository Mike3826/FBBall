// Fantrax NBA weeks typically run Monday ~7pm to Monday ~7pm.
// This league scores week 1 through Sunday, then Monday–Sunday after that.

function pad(n) {
  return String(n).padStart(2, "0");
}

function etParts(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const offset = String(parts.timeZoneName || "GMT-04:00").replace("GMT", "").replace(":", "");
  return {
    weekday: parts.weekday,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    offset,
  };
}

function parseTimestamp(iso) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00-04:00`);
  return new Date(iso);
}

function addYmd(year, month, day, delta) {
  const dt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + delta));
  return {
    year: String(dt.getUTCFullYear()),
    month: pad(dt.getUTCMonth() + 1),
    day: pad(dt.getUTCDate()),
  };
}

function etIso(year, month, day, hour, minute, second) {
  for (const off of ["-0400", "-0500"]) {
    const iso = `${year}-${month}-${day}T${pad(hour)}:${pad(minute)}:${pad(second)}.0${off}`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) continue;
    const p = etParts(parsed);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour) return iso;
  }
  throw new Error(`Could not format ET timestamp for ${year}-${month}-${day} ${hour}:${minute}:${second}`);
}

function ymdOf(iso) {
  const p = etParts(parseTimestamp(iso));
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}

function previousOrSameSunday(year, month, day, weekday) {
  const back = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 0;
  return addYmd(year, month, day, -back);
}

/** Shift Fantrax scoring periods so week 1 ends Sunday and later weeks are Mon–Sun. Idempotent. */
export function toMondaySundayPeriods(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return periods;
  return periods.map((period, i) => {
    const end = ymdOf(period.endDate);
    const sunday = previousOrSameSunday(end.year, end.month, end.day, end.weekday);
    const endDate = etIso(sunday.year, sunday.month, sunday.day, 23, 59, 59);

    if (i === 0) {
      const start = etParts(parseTimestamp(period.startDate));
      return {
        ...period,
        startDate: etIso(start.year, start.month, start.day, start.hour, start.minute, 0),
        endDate,
      };
    }

    const prevEnd = ymdOf(periods[i - 1].endDate);
    const prevSunday = previousOrSameSunday(prevEnd.year, prevEnd.month, prevEnd.day, prevEnd.weekday);
    const monday = addYmd(prevSunday.year, prevSunday.month, prevSunday.day, 1);
    return { ...period, startDate: etIso(monday.year, monday.month, monday.day, 0, 0, 0), endDate };
  });
}
