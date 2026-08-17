import { Toaster } from 'sonner';
import { sonnerTheme } from '../lib/theme';
import { useUserData } from '../stores/userData';

/** sonner's built-in light/dark styling follows the active skin's base. */
export function ThemedToaster() {
  const theme = useUserData((s) => s.uiPrefs.theme);
  const customTheme = useUserData((s) => s.uiPrefs.customTheme);
  return <Toaster richColors position="bottom-right" theme={sonnerTheme({ theme, customTheme })} />;
}
