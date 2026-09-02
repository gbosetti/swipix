import * as StoreReview from 'expo-store-review';

/**
 * Apple's guidelines are explicit that apps should never indicate whether
 * the native review prompt actually appeared, or nag the user about it —
 * the OS decides that silently (and rate-limits how often it shows), so
 * there's deliberately no user-facing success/failure feedback here,
 * unlike SupportService's mailto fallback.
 */
export async function requestAppReview(): Promise<void> {
  try {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  } catch {
    /** Nothing to surface to the user — see comment above. */
  }
}
