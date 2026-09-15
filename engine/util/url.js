// Web addresses as people type them: "example.com", "www.example.com/ar", "http://Example.com/" all become one clean form.

// Returns "https://host[/path]" (lower-case host, no trailing slash, no #fragment), or '' for empty/invalid input.
export function cleanWebsite(raw) {
  let s = String(raw ?? '').trim().replace(/^[<"'(]+|[>"')]+$/g, '');
  if (!s) return '';
  if (/^\/\//.test(s)) s = `https:${s}`;
  // Another scheme (mailto:, javascript:, tel:) is not a website; "example.com:8080" still is.
  if (/^[a-z][a-z0-9+-]*:(?!\/\/)/i.test(s) && !/^[^:/]*\./.test(s)) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url;
  try {
    url = new URL(s);
  } catch {
    return '';
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  // At least one dot and a real top-level domain (letters, or an internationalised xn-- one).
  if (!/^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)) return '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${path}${url.search}`;
}

// The same address without scheme or "www.", for showing and comparing: "example.com/ar".
export const bareWebsite = (raw) => cleanWebsite(raw).replace(/^https?:\/\/(www\.)?/, '');

// A list of links pasted with spaces, commas or new lines, each cleaned; invalid entries are dropped, duplicates removed.
export function cleanLinks(raw) {
  const parts = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,،]+/);
  return [...new Set(parts.map(cleanWebsite).filter(Boolean))];
}
