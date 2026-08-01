export interface SeriesOverrides {
  merges: Record<number, number>; // showId -> targetSeriesId
  splits: number[]; // list of showIds that should be standalone
}

export function getOverrides(): SeriesOverrides {
  const overrides = localStorage.getItem('senpai_series_overrides');
  if (overrides) {
    try {
      return JSON.parse(overrides);
    } catch(e) {}
  }
  return { merges: {}, splits: [] };
}

export function saveOverrides(overrides: SeriesOverrides) {
  localStorage.setItem('senpai_series_overrides', JSON.stringify(overrides));
  // Clear the cache of reverse map so we can re-resolve
  localStorage.removeItem('senpai_series_reverse_map');
}

export function splitFromSeries(showId: number) {
  const overrides = getOverrides();
  if (!overrides.splits.includes(showId)) {
    overrides.splits.push(showId);
    saveOverrides(overrides);
  }
}

export function mergeIntoSeries(showId: number, targetSeriesId: number) {
  const overrides = getOverrides();
  overrides.merges[showId] = targetSeriesId;
  saveOverrides(overrides);
}
