/** @vitest-environment happy-dom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUserData } from '../stores/userData';
import { PageTip } from './PageTip';

describe('PageTip', () => {
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

  const render = () => act(async () => root.render(<PageTip id="watching" />));

  it('stays hidden for anyone who never went through onboarding', async () => {
    useUserData.setState({ uiPrefs: { includeMovies: false, selectedSources: [] } });
    await render();
    expect(container.textContent).toBe('');
  });

  it('shows once after onboarding, and "Got it" retires it for good', async () => {
    useUserData.setState({ uiPrefs: { includeMovies: false, selectedSources: [], onboarded: true, seenTips: ['library'] } });
    await render();
    expect(container.textContent).toContain('How Watching works');
    // Labelled by its own title, so it reads as a region, not stray copy.
    const section = container.querySelector('section');
    expect(document.getElementById(section!.getAttribute('aria-labelledby')!)?.textContent).toBe('How Watching works');

    const gotIt = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Got it');
    await act(async () => gotIt!.click());
    expect(useUserData.getState().uiPrefs.seenTips).toEqual(['library', 'watching']);
  });
});
