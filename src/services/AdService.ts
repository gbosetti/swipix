import { Platform } from 'react-native';
import mobileAds, { AdEventType, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

/**
 * Real ad units are production-only — interacting with your own ads in
 * dev risks AdMob flagging the account for invalid traffic, so __DEV__
 * always gets Google's public test unit instead.
 */
const ANDROID_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-4602631443411685/9512837552';
const IOS_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-4602631443411685/5561381612';
const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.OS === 'android'
    ? ANDROID_INTERSTITIAL_AD_UNIT_ID
    : IOS_INTERSTITIAL_AD_UNIT_ID;

/** An ad that never loads should never leave the caller hanging. */
const LOAD_TIMEOUT_MS = 8000;
/**
 * Second ceiling for the SHOWING phase, once on screen. An interstitial
 * can get stuck (close button unresponsive, no CLOSED event) with no SDK
 * API to force it closed — this can't dismiss the stuck ad, but stops our
 * own app state from waiting forever. 60s is far beyond any normal
 * viewing time, so it only fires in this broken case.
 */
const MAX_SHOWING_MS = 60000;

/**
 * Minimum time callers should show a fallback "ad unavailable" UI after
 * {@link showInterstitialAd} resolves `false`. A no-fill response can
 * arrive in well under a second, which without an enforced floor makes
 * the delete/reset that follows look like the ad step never ran at all.
 */
export const MIN_AD_WAIT_MS = 2500;

let initialization: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initialization) {
    initialization = mobileAds()
      .initialize()
      .then(() => undefined);
  }
  return initialization;
}

/**
 * Shows a single full-screen interstitial ad if one loads in time, then
 * resolves either way — gates the "Empty Trash Now" bulk-delete action.
 * Resolves `true` only if the ad actually made it on screen; `false` for
 * every other case (no fill, load error, timeout, `show()` rejection).
 *
 * @remarks
 * Never rejects and never blocks longer than {@link LOAD_TIMEOUT_MS}:
 * deletion must proceed even with no ad fill or a slow/offline network.
 * Requests non-personalized ads only — Swipix has no analytics elsewhere,
 * and personalized ads would need an ATT prompt this app doesn't need.
 */
export async function showInterstitialAd(): Promise<boolean> {
  try {
    await ensureInitialized();
  } catch {
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    let showingTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (shown: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      clearTimeout(showingTimeoutId);
      unsubscribeLoaded();
      unsubscribeError();
      unsubscribeClosed();
      resolve(shown);
    };

    /**
     * Only guards the load phase — left running for the ad's whole
     * lifetime, it could fire while the ad is still on screen, letting
     * the delete flow start underneath it. Cleared once showing begins.
     */
    const timeoutId = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);

    const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      clearTimeout(timeoutId);
      interstitial.show().catch(() => finish(false));
      /**
       * Stuck showing (close button unresponsive, no CLOSED event) still
       * means the ad was actually displayed, so this counts as shown.
       */
      showingTimeoutId = setTimeout(() => finish(true), MAX_SHOWING_MS);
    });
    const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, () => finish(false));
    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => finish(true));

    interstitial.load();
  });
}
