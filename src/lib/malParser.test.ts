/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMalXml } from './malParser';

function wrap(...animeBlocks: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_name>tester</user_name><user_total_anime>1</user_total_anime></myinfo>
  ${animeBlocks.join('\n')}
</myanimelist>`;
}

const anime = (fields: Record<string, string | number>) =>
  `<anime>${Object.entries(fields)
    .map(([tag, value]) => `<${tag}>${value}</${tag}>`)
    .join('')}</anime>`;

describe('parseMalXml', () => {
  it('parses a real MAL export, whose my_status is a display name', () => {
    // The shape MAL's own "Export Your List" produces: status as text, plus a
    // pile of tags this parser ignores.
    //
    // Real exports wrap <series_title> and <my_comments> in CDATA, which is
    // omitted here: happy-dom drops every sibling that follows a CDATA section,
    // so including it would test the DOM implementation rather than this
    // parser. Browsers (where this actually runs) handle CDATA correctly.
    const xml = wrap(
      `<anime>
        <series_animedb_id>1</series_animedb_id>
        <series_title>Cowboy Bebop</series_title>
        <series_type>TV</series_type>
        <series_episodes>26</series_episodes>
        <my_watched_episodes>26</my_watched_episodes>
        <my_score>9</my_score>
        <my_status>Completed</my_status>
        <update_on_import>0</update_on_import>
      </anime>`,
    );

    expect(parseMalXml(xml)).toEqual([
      { series_animedb_id: 1, my_status: 2, my_score: 9, my_watched_episodes: 26 },
    ]);
  });

  it('maps every export status name onto its numeric code', () => {
    const names: Array<[string, number]> = [
      ['Watching', 1],
      ['Completed', 2],
      ['On-Hold', 3],
      ['Dropped', 4],
      ['Plan to Watch', 6],
      // Casing and punctuation vary across MAL versions and the third-party
      // converters people run their lists through.
      ['plan_to_watch', 6],
      ['on hold', 3],
      ['COMPLETED', 2],
    ];

    for (const [name, code] of names) {
      const [entry] = parseMalXml(wrap(anime({ series_animedb_id: 5, my_status: name })));
      expect(entry.my_status, name).toBe(code);
    }
  });

  it('still reads the numeric codes the MAL API emits', () => {
    for (const code of [1, 2, 3, 4, 6]) {
      const [entry] = parseMalXml(wrap(anime({ series_animedb_id: 5, my_status: code })));
      expect(entry.my_status).toBe(code);
    }
  });

  it('leaves an unrecognized status as 0 so the caller can apply its own default', () => {
    const [entry] = parseMalXml(wrap(anime({ series_animedb_id: 5, my_status: 'Rewatching?' })));
    expect(entry.my_status).toBe(0);
  });

  it('drops entries with no usable series id', () => {
    const xml = wrap(
      anime({ series_animedb_id: 0, my_status: 'Completed' }),
      anime({ my_status: 'Completed' }), // tag absent entirely
      anime({ series_animedb_id: 'not-a-number', my_status: 'Completed' }),
      anime({ series_animedb_id: 42, my_status: 'Completed' }),
    );

    expect(parseMalXml(xml).map((e) => e.series_animedb_id)).toEqual([42]);
  });

  it('defaults missing numeric fields to 0 rather than NaN', () => {
    const [entry] = parseMalXml(wrap(anime({ series_animedb_id: 7 })));

    expect(entry).toEqual({
      series_animedb_id: 7,
      my_status: 0,
      my_score: 0,
      my_watched_episodes: 0,
    });
  });

  it('returns nothing for an empty list or a file that is not a MAL export', () => {
    expect(parseMalXml(wrap())).toEqual([]);
    expect(parseMalXml('<html><body>not xml you want</body></html>')).toEqual([]);
    expect(parseMalXml('')).toEqual([]);
  });
});
