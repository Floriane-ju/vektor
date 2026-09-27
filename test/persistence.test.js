// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debounce, saveLocal, serialize } from '../src/persistence.js';

const KEY = 'illu:scene:v1';
const scene = { layers: [], activeLayerId: null, activeElementId: null };

describe('autosave', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(KEY);
  });

  it('écrit un JSON compact, l’export reste indenté', () => {
    expect(saveLocal(scene)).toBe(true);
    expect(localStorage.getItem(KEY)).not.toMatch(/\n/);
    expect(serialize(scene)).toMatch(/\n/);
  });

  it('signale un échec d’écriture', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(saveLocal(scene)).toBe(false);
  });

  it('flush exécute tout de suite l’appel en attente, une seule fois', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn);
    debounced('a');
    debounced('b');
    debounced.flush();
    expect(fn).toHaveBeenCalledExactlyOnceWith('b');
    vi.runAllTimers();
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
