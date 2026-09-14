import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, linkedInActivityDate, extractFromJson, parseJsonBodies, mergeExtractions } from '../../collect/social/extract.js';

test('counts in every format a page shows become numbers; nothing becomes a guess', () => {
  assert.equal(parseCount('1,234'), 1234);
  assert.equal(parseCount('1.2K'), 1200);
  assert.equal(parseCount('3M followers'), 3000000);
  assert.equal(parseCount('١٬٢٣٤'), 1234);
  assert.equal(parseCount('12.5 ألف'), 12500);
  assert.equal(parseCount(''), null);
  assert.equal(parseCount('no numbers'), null);
  assert.equal(parseCount(42), 42);
});

test('LinkedIn post dates come from the activity id itself', () => {
  // An id created from a known time: (ms << 22) — decoding must return that exact time.
  const ms = Date.UTC(2026, 7, 2, 9, 30);
  const id = (BigInt(ms) << 22n) + 12345n;
  assert.equal(linkedInActivityDate(id.toString()), new Date(ms).toISOString());
  assert.equal(linkedInActivityDate('123'), null);
  assert.equal(linkedInActivityDate('not-a-number'), null);
});

test('LinkedIn: counts and captions are joined by activity id across separate response entities', () => {
  const ms = Date.UTC(2026, 8, 1);
  const id = ((BigInt(ms) << 22n) + 7n).toString();
  const body = {
    included: [
      { $type: 'com.linkedin.voyager.dash.feed.Update', metadata: { backendUrn: `urn:li:activity:${id}` }, commentary: { text: { text: 'مشروع برج نايا في الرياض' } }, content: { imageComponent: { images: [{}] } } },
      { $type: 'com.linkedin.voyager.dash.feed.SocialActivityCounts', entityUrn: `urn:li:fsd_socialActivityCounts:urn:li:activity:${id}`, numLikes: 40, numComments: 3, numShares: 2, reactionTypeCounts: [{ count: 30, reactionType: 'LIKE' }, { count: 12, reactionType: 'PRAISE' }] },
      { $type: 'com.linkedin.voyager.dash.organization.Company', followerCount: 2093 },
    ],
  };
  const r = extractFromJson('linkedin', [body]);
  assert.equal(r.posts.length, 1);
  const p = r.posts[0];
  assert.equal(p.likes, 42, 'reaction types are summed');
  assert.equal(p.comments, 3);
  assert.equal(p.shares, 2);
  assert.equal(p.type, 'image');
  assert.equal(p.caption, 'مشروع برج نايا في الرياض');
  assert.equal(p.date, new Date(ms).toISOString());
});

test('Instagram: posts from the web app data, and profile numbers only for the requested account', () => {
  const body = {
    data: {
      user: { username: 'technopanelco', follower_count: 656, media_count: 696, full_name: 'Technopanel' },
      items: [
        { code: 'Cabc1', taken_at: 1788000000, like_count: 25, comment_count: 2, media_type: 8, caption: { text: 'Big 5 Dubai' } },
        { code: 'Cabc2', taken_at: 1787000000, like_count: 90, comment_count: 7, media_type: 2, product_type: 'clips', play_count: 4100, caption: null },
      ],
      suggested: [{ username: 'someoneelse', follower_count: 999999 }],
    },
  };
  const r = extractFromJson('instagram', [body], { handle: 'technopanelco' });
  assert.equal(r.profile.followers, 656);
  assert.equal(r.profile.postsTotal, 696);
  const reel = r.posts.find((p) => p.id === 'Cabc2');
  assert.equal(reel.type, 'video');
  assert.equal(reel.views, 4100);
  assert.equal(r.posts.find((p) => p.id === 'Cabc1').type, 'carousel');
});

test('X: tweets and the profile\'s own follower count', () => {
  const body = { data: { user: { result: { legacy: { screen_name: 'technopanels', followers_count: 310, statuses_count: 95, name: 'Technopanel' } } }, timeline: [{ rest_id: '1', legacy: { id_str: '1850000000000000000', created_at: 'Wed Aug 12 10:00:00 +0000 2026', favorite_count: 5, reply_count: 1, retweet_count: 2, quote_count: 1, full_text: 'hello', extended_entities: { media: [{ type: 'video' }] } }, views: { count: '800' } }] } };
  const r = extractFromJson('x', [body], { handle: 'technopanels' });
  assert.equal(r.profile.followers, 310);
  assert.deepEqual({ likes: r.posts[0].likes, comments: r.posts[0].comments, shares: r.posts[0].shares, views: r.posts[0].views, type: r.posts[0].type }, { likes: 5, comments: 1, shares: 3, views: 800, type: 'video' });
});

test('Facebook: a story node\'s nested creation time and feedback counts are found', () => {
  const feedback = { reaction_count: { count: 17 }, comment_rendering_instance: { comments: { total_count: 4 } }, share_count: { count: 1 } };
  const body = {
    data: {
      node: {
        post_id: '10160000000000001',
        comet_sections: {
          content: { story: { message: { text: 'منشور تجريبي' }, attachments: [{ styles: { attachment: { all_subattachments: { nodes: [{}, {}] } } } }] } },
          context_layout: { story: { comet_sections: { metadata: [{ story: { creation_time: 1788100000 } }] } } },
          feedback: { story: { feedback_context: { feedback_target_with_context: { comet_ufi_summary_and_actions_renderer: { feedback } } } } },
        },
      },
    },
  };
  const r = extractFromJson('facebook', parseJsonBodies(`for (;;);${JSON.stringify(body)}`));
  assert.equal(r.posts.length, 1);
  assert.deepEqual({ likes: r.posts[0].likes, comments: r.posts[0].comments, shares: r.posts[0].shares, type: r.posts[0].type }, { likes: 17, comments: 4, shares: 1, type: 'carousel' });
  assert.equal(r.posts[0].date, new Date(1788100000 * 1000).toISOString());
});

test('merging keeps the first real value, fills gaps from other sources, and orders posts newest first', () => {
  const ms = Date.UTC(2026, 6, 1);
  const older = ((BigInt(ms) << 22n) + 1n).toString();
  const newer = ((BigInt(ms + 86_400_000 * 20) << 22n) + 1n).toString();
  const merged = mergeExtractions('linkedin', [
    { posts: [{ id: older, likes: 10, comments: null }], profile: { followers: null } },
    { posts: [{ id: older, likes: 99, comments: 4 }, { id: newer, likes: 1 }], profile: { followers: 2093 } },
  ]);
  assert.deepEqual(merged.posts.map((p) => p.id), [newer, older]);
  assert.equal(merged.posts[1].likes, 10);
  assert.equal(merged.posts[1].comments, 4);
  assert.equal(merged.profile.followers, 2093);
  assert.equal(merged.posts[1].date, new Date(ms).toISOString());
});
