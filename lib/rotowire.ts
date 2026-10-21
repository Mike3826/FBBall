// Server-side only: fetches and parses Rotowire HTML. Import from server components / route handlers.

export type RotowireNews = {
  headline: string;
  date: string; // e.g. "October 17, 2026"
  text: string;
  injury: string | null;
};

export type RotowireProfile = {
  url: string;
  headshot: string;
  team: string | null;
  position: string | null;
  age: string | null;
  height: string | null;
  weight: string | null;
  from: string | null;
  draft: string | null;
  news: RotowireNews[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function text(html: string | undefined | null): string {
  if (!html) return "";
  return decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function pick(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? text(m[1]) || null : null;
}

function parseNews(html: string): RotowireNews[] {
  const re =
    /<div class="news-update(?:\s[^"]*)?">\s*<div class="news-update__top">([\s\S]*?)<div class="news-update__analysis">/g;
  const items: RotowireNews[] = [];
  for (const m of html.matchAll(re)) {
    const block = m[1];
    const headline = pick(block, /class="news-update__headline"[^>]*>([\s\S]*?)<\/(?:div|a)>/);
    const date = pick(block, /class="news-update__timestamp">([\s\S]*?)<\/div>/);
    const body = pick(block, /class="news-update__news">([\s\S]*?)<\/div>/);
    const injury = pick(block, /class="news-update__inj">([\s\S]*?)<\/div>/);
    if (!headline && !body) continue;
    items.push({ headline: headline ?? "", date: date ?? "", text: body ?? "", injury });
  }
  // The page repeats a few items in a "recent news" block; dedupe and order newest first.
  const seen = new Set<string>();
  return items
    .filter((n) => {
      const key = `${n.date}|${n.headline}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

export const ROTOWIRE_TTL_MS = 10 * 60_000;

const profileCache = new Map<number, { at: number; profile: RotowireProfile | null }>();

export function invalidateRotowire() {
  profileCache.clear();
}

/**
 * Fetches a player's Rotowire profile page and extracts bio + latest news.
 * Cached in memory for 10 minutes; returns null on any failure so the page still renders.
 */
export async function getRotowireProfile(rotowireId: number): Promise<RotowireProfile | null> {
  const hit = profileCache.get(rotowireId);
  if (hit && Date.now() - hit.at < ROTOWIRE_TTL_MS) return hit.profile;
  try {
    const res = await fetch(`https://www.rotowire.com/basketball/player.php?id=${rotowireId}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) {
      profileCache.set(rotowireId, { at: Date.now(), profile: hit?.profile ?? null });
      return hit?.profile ?? null;
    }
    const html = await res.text();

    // Only the hero card + news feed matter; trim to keep regexes cheap.
    const heroStart = html.indexOf('class="pp2-hero');
    const hero = heroStart >= 0 ? html.slice(heroStart, heroStart + 6000) : "";

    const profile: RotowireProfile = {
      url: res.url || `https://www.rotowire.com/basketball/player.php?id=${rotowireId}`,
      headshot: `https://assets.rotowire.com/images/player/nba/${rotowireId}.png`,
      team: pick(hero, /class="pp2-sub-team">([\s\S]*?)<\/span>/),
      position: pick(hero, /class="pp2-sub-pos">([\s\S]*?)<\/span>/),
      age: pick(hero, /class="pp2-info-age">[\s\S]*?<b>([\s\S]*?)<\/b>/),
      height: pick(hero, /class="pp2-info-ht">[\s\S]*?<b>([\s\S]*?)<\/b>/),
      weight: pick(hero, /class="pp2-info-wt">[\s\S]*?<b>([\s\S]*?)<\/b>/),
      from: pick(hero, /class="pp2-info-from">[\s\S]*?<b>([\s\S]*?)<\/b>/),
      draft: pick(hero, /class="pp2-info-draft">[\s\S]*?<b>([\s\S]*?)<\/b>/),
      news: parseNews(html),
    };
    profileCache.set(rotowireId, { at: Date.now(), profile });
    return profile;
  } catch {
    const fallback = hit?.profile ?? null;
    profileCache.set(rotowireId, { at: Date.now(), profile: fallback });
    return fallback;
  }
}
