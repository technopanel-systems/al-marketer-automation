// The "digital presence vs competitors" slide model — built by code from the social scorecard, never written by AI.
const STATUS_AR = { active: 'نشط', irregular: 'نشر غير منتظم', inactive: 'متوقف عن النشر', no_posts: 'بدون منشورات', unknown: 'غير واضح', not_found: 'مش موجود على المنصة' };
const ORDER = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'snapchat'];

/**
 * Picks up to `max` platforms where the client can be compared: the client has numbers, or the client has no account
 * while competitors do. Returns null when there is nothing to show.
 */
export function digitalModel(scorecard, { max = 4 } = {}) {
  if (!scorecard?.platforms?.length) return null;
  const platforms = [];
  for (const pl of [...scorecard.platforms].sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform))) {
    const client = pl.rows.find((r) => r.role === 'client');
    const med = pl.competitorMedian;
    if (!client) continue;
    if (!client.metrics && !(client.state === 'not_found' && med)) continue;
    const m = client.metrics;
    platforms.push({
      platform: pl.platform,
      name: pl.name,
      status: m ? m.status : 'not_found',
      statusAr: STATUS_AR[m ? m.status : 'not_found'] || '',
      client: m ? { postsPerWeek: m.postsPerWeek, daysSinceLastPost: m.daysSinceLastPost, avgInteractions: m.avgInteractions, followers: m.followers } : null,
      competitors: med ? { brands: med.brands, postsPerWeek: med.postsPerWeek, avgInteractions: med.avgInteractions, followers: med.followers } : null,
      referencePostsPerWeek: pl.benchmark?.postsPerWeek ? (pl.benchmark.postsPerWeek.low === pl.benchmark.postsPerWeek.high ? `${pl.benchmark.postsPerWeek.low}` : `${pl.benchmark.postsPerWeek.low}–${pl.benchmark.postsPerWeek.high}`) : null,
    });
  }
  // Platforms with numbers first, then the ones where only the competitors are present.
  platforms.sort((a, b) => Number(!a.client) - Number(!b.client));
  const shown = platforms.slice(0, max);
  if (!shown.length) return null;
  return {
    title: 'الحضور [[الرقمي]]',
    intro: `مقارنة بالمنافسين على آخر ${scorecard.windowDays || 90} يوم من المنشورات العامة، محسوبة بنفس الطريقة للكل.`,
    note: 'المنافسين = القيمة الوسطى للمنافسين اللي تم رصدهم. الأرقام من الصفحات العامة وقت الرصد، مش من لوحات الحسابات الداخلية.',
    platforms: shown,
  };
}
