import { create } from 'zustand';
import type { OnboardingStart } from '../../lib/onboarding';

/**
 * Whether the onboarding dialog is open, and where it starts. Deliberately not
 * persisted and not in the user-data store: it is UI state, like the Settings
 * dialog's open flag, but it needs openers far from RootLayout (WelcomeHero on
 * the schedule, the Settings row), so it lives in its own tiny store.
 * `uiPrefs.onboarded` is the durable half.
 */
interface OnboardingUiState {
  open: boolean;
  start: OnboardingStart;
}

export const useOnboarding = create<OnboardingUiState>(() => ({ open: false, start: 'welcome' }));

export function openOnboarding(start: OnboardingStart = 'welcome'): void {
  useOnboarding.setState({ open: true, start });
}

export function closeOnboarding(): void {
  useOnboarding.setState({ open: false });
}
