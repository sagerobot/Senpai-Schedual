/** @vitest-environment happy-dom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './SettingsDialog';
import { useUserData } from '../../stores/userData';

function findByText<T extends Element>(selector: string, text: string): T | null {
  return (
    Array.from(document.body.querySelectorAll<T>(selector)).find((el) => el.textContent?.trim() === text) ?? null
  );
}

/**
 * React installs its own `value` setter on the node to dedupe change events, so
 * assigning `input.value` directly is invisible to it. Go through the prototype
 * setter the way a real keystroke does.
 */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SettingsDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  async function open() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SettingsDialog open onOpenChange={vi.fn()} />
        </MemoryRouter>,
      );
    });
  }

  it('is a labelled dialog', async () => {
    await open();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // Radix wires Title/Description into aria-labelledby / aria-describedby.
    const labelId = dialog!.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId!)?.textContent).toBe('Data & Settings');
    expect(dialog!.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('only clears data once the confirmation phrase is typed', async () => {
    useUserData.getState().addToLibrary(21, 'watching');
    await open();

    await act(async () => {
      findByText<HTMLButtonElement>('button', 'Clear all data')!.click();
    });

    const input = document.body.querySelector<HTMLInputElement>('#clear-confirm');
    const deleteButton = findByText<HTMLButtonElement>('button', 'Delete everything');
    expect(input).not.toBeNull();
    expect(deleteButton!.disabled).toBe(true);

    // A near miss stays disabled, and clicking it is a no-op.
    await act(async () => {
      type(input!, 'delete');
    });
    expect(findByText<HTMLButtonElement>('button', 'Delete everything')!.disabled).toBe(true);
    await act(async () => {
      deleteButton!.click();
    });
    expect(Object.keys(useUserData.getState().library)).toEqual(['21']);

    await act(async () => {
      type(input!, 'DELETE');
    });
    expect(findByText<HTMLButtonElement>('button', 'Delete everything')!.disabled).toBe(false);
    await act(async () => {
      findByText<HTMLButtonElement>('button', 'Delete everything')!.click();
    });

    expect(useUserData.getState().library).toEqual({});
    expect(localStorage.getItem('senpai.queryCache.v1')).toBeNull();
  });
});
