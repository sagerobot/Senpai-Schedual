import { describe, expect, it } from 'vitest';
import {
  cleanComment,
  COMMENT_MAX_CHARS,
  episodeFromTitle,
  ordinalsAgree,
  packComments,
  pickThread,
  scoreThread,
  searchQuery,
  seasonOrdinals,
  showPartOfTitle,
  trimToBudget,
  MIN_THREAD_SCORE,
} from './redditThreads';

/** r/anime's bot opens every episode thread with the show's other names. */
const altNames = (...names: string[]) => `**Alternative names:** ${names.join(', ')}\n\n---\n\n**Rate this episode here.**`;

describe('episodeFromTitle', () => {
  it.each([
    ['Dandadan - Episode 5 discussion', 5],
    ['Sousou no Frieren - Episode 28 discussion', 28],
    ['Kusuriya no Hitorigoto Season 2 - Episode 12 discussion', 12],
    ['One Piece - Episode 1122 discussion', 1122],
    ['Show Title - Ep. 3 Discussion', 3],
    ['[Rewatch] Cowboy Bebop - Episode 7 Discussion', 7],
  ])('reads %s', (title, episode) => {
    expect(episodeFromTitle(title)).toBe(episode);
  });

  it('returns null for anything that is not an episode thread', () => {
    expect(episodeFromTitle('Dandadan - Series Discussion')).toBeNull();
    expect(episodeFromTitle('What is everyone watching this season?')).toBeNull();
  });
});

describe('showPartOfTitle', () => {
  it('drops the episode suffix and any bracketed tag', () => {
    expect(showPartOfTitle('Dandadan - Episode 5 discussion')).toBe('Dandadan');
    expect(showPartOfTitle('[Rewatch] Cowboy Bebop - Episode 7 Discussion')).toBe('Cowboy Bebop');
    expect(showPartOfTitle('Kusuriya no Hitorigoto Season 2 - Episode 12 discussion')).toBe(
      'Kusuriya no Hitorigoto Season 2',
    );
  });
});

describe('seasonOrdinals', () => {
  it.each([
    ['Dandadan', []],
    ['Dandadan Season 2', [2]],
    ['Kusuriya no Hitorigoto 2nd Season', [2]],
    ['Jujutsu Kaisen S2', [2]],
    ['Overlord IV', [4]],
    ['Attack on Titan Final Season Part 2', [2]],
    ['Dr. Stone Season 4 Part 2', [4, 2]],
    ['Kaiju No. 8', [8]],
    ['Steins;Gate 0', []],
    ['Mob Psycho 100', []],
  ])('reads %s as %j', (title, expected) => {
    expect([...seasonOrdinals(title)].sort()).toEqual([...expected].sort());
  });
});

describe('ordinalsAgree', () => {
  it('agrees when neither title marks a season', () => {
    expect(ordinalsAgree(new Set(), new Set())).toBe(true);
  });

  it('agrees when the marks overlap at all', () => {
    // "Dr. Stone: Science Future Part 2" against "Dr. Stone Season 4 Part 2".
    expect(ordinalsAgree(new Set([2]), new Set([4, 2]))).toBe(true);
  });

  it('disagrees when one side is unmarked — that is the season-1 thread', () => {
    expect(ordinalsAgree(new Set([2]), new Set())).toBe(false);
    expect(ordinalsAgree(new Set(), new Set([2]))).toBe(false);
  });

  it('disagrees on disjoint marks', () => {
    expect(ordinalsAgree(new Set([2]), new Set([3]))).toBe(false);
  });
});

describe('scoreThread', () => {
  const target = { title: 'Dandadan', episode: 5 };

  it('accepts the thread the bot actually posts', () => {
    expect(scoreThread({ title: 'Dandadan - Episode 5 discussion' }, target)).toBeGreaterThanOrEqual(0.9);
  });

  it('accepts a differently-spaced transliteration', () => {
    expect(scoreThread({ title: 'Dan Da Dan - Episode 5 discussion' }, target)).toBeGreaterThanOrEqual(
      MIN_THREAD_SCORE,
    );
  });

  it('rejects the right show on the wrong episode', () => {
    expect(scoreThread({ title: 'Dandadan - Episode 6 discussion' }, target)).toBe(0);
  });

  it('rejects a thread with no episode number', () => {
    expect(scoreThread({ title: 'Dandadan - Series Discussion' }, target)).toBe(0);
  });

  it('rejects the next season, which is the near-miss reddit search hands you', () => {
    expect(scoreThread({ title: 'Dandadan Season 2 - Episode 5 discussion' }, target)).toBe(0);
  });

  it('hard-rejects the previous season even before similarity is considered', () => {
    const season2 = { title: 'Kusuriya no Hitorigoto 2nd Season', episode: 12 };
    // The season-1 thread scores exactly zero: the marks disagree, so nothing
    // about the wording can talk the scorer into it.
    expect(scoreThread({ title: 'The Apothecary Diaries - Episode 12 discussion' }, season2)).toBe(0);
    // Its own season's thread survives that gate, but an English title against
    // a romaji work item still needs the body to clear the bar.
    const rightSeason = { title: 'The Apothecary Diaries Season 2 - Episode 12 discussion' };
    expect(scoreThread(rightSeason, season2)).toBeGreaterThan(0);
    expect(scoreThread(rightSeason, season2)).toBeLessThan(MIN_THREAD_SCORE);
    expect(
      scoreThread({ ...rightSeason, selftext: altNames('Kusuriya no Hitorigoto 2nd Season') }, season2),
    ).toBeGreaterThanOrEqual(MIN_THREAD_SCORE);
  });

  it('rescues an English-titled thread from the alternative names in its body', () => {
    // AniList hands us romaji; r/anime titles the thread in English. The two
    // share no words and few letters — the body is the only thing that links them.
    const frieren = { title: 'Sousou no Frieren', episode: 28 };
    const bare = { title: "Frieren: Beyond Journey's End - Episode 28 discussion" };
    expect(scoreThread(bare, frieren)).toBeLessThan(MIN_THREAD_SCORE);

    const withBody = { ...bare, selftext: altNames("Frieren: Beyond Journey's End", 'Sousou no Frieren') };
    expect(scoreThread(withBody, frieren)).toBeGreaterThanOrEqual(MIN_THREAD_SCORE);
  });

  it('does not let the body rescue the wrong season', () => {
    const season2 = { title: 'Sousou no Frieren Season 2', episode: 4 };
    const season1 = {
      title: "Frieren: Beyond Journey's End - Episode 4 discussion",
      selftext: altNames('Sousou no Frieren'),
    };
    expect(scoreThread(season1, season2)).toBe(0);
  });

  it('rejects an unrelated show that happens to be on the same episode', () => {
    expect(scoreThread({ title: 'One Piece - Episode 5 discussion' }, target)).toBeLessThan(MIN_THREAD_SCORE);
  });
});

describe('pickThread', () => {
  const target = { title: 'Dandadan', episode: 5 };

  it('takes the best match out of a realistic search page', () => {
    const picked = pickThread(
      [
        { title: 'What did everyone think of Dandadan so far?' },
        { title: 'Dandadan Season 2 - Episode 5 discussion' },
        { title: 'Dandadan - Episode 4 discussion' },
        { title: 'Dandadan - Episode 5 discussion', num_comments: 2400 },
        { title: 'Dandadan - Episode 5 discussion [Spoilers]', num_comments: 3 },
      ],
      target,
    );
    expect(picked?.num_comments).toBe(2400);
  });

  it('returns null when nothing clears the bar, rather than the least bad option', () => {
    expect(pickThread([{ title: 'One Piece - Episode 5 discussion' }, { title: 'Dandadan fan art' }], target)).toBeNull();
    expect(pickThread([], target)).toBeNull();
  });

  it('breaks a tie towards the busier thread', () => {
    const picked = pickThread(
      [
        { title: 'Dandadan - Episode 5 discussion', num_comments: 12 },
        { title: 'Dandadan - Episode 5 discussion', num_comments: 900 },
      ],
      target,
    );
    expect(picked?.num_comments).toBe(900);
  });
});

describe('searchQuery', () => {
  it('phrases the query the way the bot titles the thread', () => {
    expect(searchQuery({ title: 'Dandadan', episode: 5 })).toBe('Dandadan episode 5 discussion');
  });
});

describe('cleanComment', () => {
  it('collapses whitespace', () => {
    expect(cleanComment({ body: 'That fight\n\n   was great' })).toBe('That fight was great');
  });

  it('strips username mentions in both spellings', () => {
    expect(cleanComment({ body: 'u/someone said it, /u/other-one agreed' })).toBe('[user] said it, [user] agreed');
  });

  it('leaves spoiler markers alone — the writer needs to know what not to repeat', () => {
    expect(cleanComment({ body: 'I cried at >!the ending!<' })).toBe('I cried at >!the ending!<');
  });

  it('drops the bot, deleted comments, and empty ones', () => {
    expect(cleanComment({ body: 'Source material corner...', author: 'AutoModerator' })).toBeNull();
    expect(cleanComment({ body: '[deleted]' })).toBeNull();
    expect(cleanComment({ body: '   ' })).toBeNull();
    expect(cleanComment({})).toBeNull();
  });

  it('truncates a long comment to the cap, marker included', () => {
    const cleaned = cleanComment({ body: 'x'.repeat(900) });
    expect(cleaned).toHaveLength(COMMENT_MAX_CHARS);
    expect(cleaned?.endsWith('…')).toBe(true);
  });

  it('leaves a comment exactly at the cap unmarked', () => {
    expect(cleanComment({ body: 'y'.repeat(COMMENT_MAX_CHARS) })).toBe('y'.repeat(COMMENT_MAX_CHARS));
  });
});

describe('packComments', () => {
  it('keeps order and stops at the limit, counting only what survived cleaning', () => {
    const raw = [
      { body: '[removed]' },
      { body: 'first' },
      { body: 'stuff', author: 'AutoModerator' },
      { body: 'second' },
      { body: 'third' },
    ];
    expect(packComments(raw, 2)).toEqual(['first', 'second']);
  });
});

describe('trimToBudget', () => {
  const item = (comments: string[]) => ({ id: comments.length, comments });

  it('leaves a packet that already fits alone', () => {
    const items = [item(['short', 'also short'])];
    expect(trimToBudget(items, 10_000)).toEqual({ items, dropped: 0 });
  });

  it('drops the longest comments first until the packet fits', () => {
    const items = [item(['tiny', 'z'.repeat(400), 'small'])];
    const result = trimToBudget(items, 120);

    expect(result.dropped).toBe(1);
    expect(result.items[0].comments).toEqual(['tiny', 'small']);
  });

  it('never strips an item down to nothing — no comments reads as no discussion', () => {
    const result = trimToBudget([item(['q'.repeat(400)])], 10);

    expect(result.items[0].comments).toHaveLength(1);
    expect(result.dropped).toBe(0);
  });

  it('spreads the cuts across items rather than emptying the first', () => {
    const items = [item(Array(10).fill('a'.repeat(300))), item(Array(10).fill('b'.repeat(300)))];
    const result = trimToBudget(items, 3_000);

    expect(result.items[0].comments.length).toBeGreaterThan(1);
    expect(result.items[1].comments.length).toBeGreaterThan(1);
  });
});
