import { useUserData } from '../stores/userData';

/** Facade over the userData store; keeps the pre-store hook API. */
export function useSimulcastOffsets() {
  const offsets = useUserData((s) => s.offsets);
  const setOffset = useUserData((s) => s.setOffset);

  return { offsets, setOffset };
}
