// Why a capture route did not give numbers — one word the code can act on, and a sentence a person can act on.
//   not_found              the account does not exist (checked; propose "not on this platform" or find the right page)
//   posts_hidden           the account exists (followers known) but the platform hides its posts from logged-out visitors
//   restricted_or_missing  Facebook: an age/country-restricted page looks the same as a missing one
//   private                the account is private
//   login_wall             the platform asked for a login this time
//   rate_limited           the platform refused for now (retryAfter says when to try again)
//   wrong_page             the page belongs to someone else (it links another company's website)
//   parse_failed           the page loaded but its layout changed; try the next route
export class CaptureError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

// Try the next route for these; stop the chain for the others (they are answers, not failures).
export const TRY_NEXT = new Set(['posts_hidden', 'login_wall', 'rate_limited', 'parse_failed', 'restricted_or_missing']);
export const isDefinitive = (e) => e?.code === 'not_found' || e?.code === 'private' || e?.code === 'wrong_page';

// Which of several route errors best explains the outcome.
const RANK = ['wrong_page', 'not_found', 'private', 'posts_hidden', 'restricted_or_missing', 'rate_limited', 'login_wall', 'parse_failed'];
export function bestError(errors) {
  const typed = errors.filter((e) => e?.code);
  typed.sort((a, b) => RANK.indexOf(a.code) - RANK.indexOf(b.code));
  return typed[0] || errors[errors.length - 1] || new Error('No route could read this profile');
}
