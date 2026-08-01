import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { z } from 'zod';
import { QUERY_CACHE_KEY, readJSON, removeKey, writeJSON } from './storage';

interface MemoryStorage {
  getItem: Mock<(key: string) => string | null>;
  setItem: Mock<(key: string, value: string) => void>;
  removeItem: Mock<(key: string) => void>;
  clear: () => void;
}

function createMemoryStorage(): MemoryStorage {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (map.has(key) ? map.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
    clear: () => map.clear(),
  };
}

function quotaError(): Error {
  const err = new Error('storage full');
  err.name = 'QuotaExceededError';
  return err;
}

let storage: MemoryStorage;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readJSON', () => {
  const schema = z.object({ count: z.number() });
  const fallback = { count: 0 };

  it('returns the fallback for a missing key without warning', () => {
    expect(readJSON('missing', schema, fallback)).toEqual(fallback);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns the fallback and warns once on corrupt JSON', () => {
    storage.setItem('bad', '{not json at all');
    warnSpy.mockClear();
    expect(readJSON('bad', schema, fallback)).toEqual(fallback);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the fallback and warns once on a schema mismatch', () => {
    storage.setItem('mismatch', JSON.stringify({ count: 'ten' }));
    warnSpy.mockClear();
    expect(readJSON('mismatch', schema, fallback)).toEqual(fallback);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the parsed value on the happy path', () => {
    storage.setItem('good', JSON.stringify({ count: 42 }));
    expect(readJSON('good', schema, fallback)).toEqual({ count: 42 });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('writeJSON', () => {
  it('round-trips a value through readJSON', () => {
    const result = writeJSON('key', { a: 1 });
    expect(result).toEqual({ ok: true });
    expect(readJSON('key', z.object({ a: z.number() }), { a: 0 })).toEqual({ a: 1 });
  });

  it('evicts the query cache and retries once on QuotaExceededError', () => {
    storage.setItem(QUERY_CACHE_KEY, '"big cached blob"');
    storage.setItem.mockImplementationOnce(() => {
      throw quotaError();
    });

    const result = writeJSON('key', { a: 1 });

    expect(result).toEqual({ ok: true });
    expect(storage.removeItem).toHaveBeenCalledWith(QUERY_CACHE_KEY);
    expect(storage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(storage.getItem('key')).toBe(JSON.stringify({ a: 1 }));
  });

  it('reports { ok: false, reason: "quota" } when the retry also hits quota', () => {
    storage.setItem.mockImplementation(() => {
      throw quotaError();
    });

    const result = writeJSON('key', { a: 1 });

    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect(storage.removeItem).toHaveBeenCalledWith(QUERY_CACHE_KEY);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it('reports { ok: false, reason: "error" } for non-quota failures', () => {
    storage.setItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(writeJSON('key', { a: 1 })).toEqual({ ok: false, reason: 'error' });
  });

  it('reports { ok: false, reason: "error" } for unserializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(writeJSON('key', circular)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('removeKey', () => {
  it('removes the key and never throws', () => {
    storage.setItem('key', '"x"');
    removeKey('key');
    expect(storage.getItem('key')).toBeNull();

    storage.removeItem.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => removeKey('key')).not.toThrow();
  });
});
