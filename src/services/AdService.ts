import { Platform } from 'react-native';
import mobileAds, { AdEventType, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

// Real ad units — "Swipix - Empty Trash" on iOS, "Swipix - Bulk
// Actions" on Android in the AdMob dashboard — are only used in
// production builds, and each platform has its own — an iOS ad unit ID
// doesn't work on Android or vice versa. Interacting with your own real
// ads during development risks AdMob flagging the account for invalid
// traffic, so __DEV__ builds always get Google's public test unit
// instead (already platform-aware on its own) — it serves fake ads that
// behave identically but never affect the account.
const ANDROID_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-4602631443411685/9512837552';
const IOS_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-4602631443411685/5561381612';
const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.OS === 'android'
    ? ANDROID_INTERSTITIAL_AD_UNIT_ID
    : IOS_INTERSTITIAL_AD_UNIT_ID;

// An ad that never loads (no fill, offline, slow network) should never
// leave the caller hanging — 8s is generous for a load that's genuinely
// going to succeed, short enough that "skip the ad" resolves before the
// delete flow it's gating would feel broken.
const LOAD_TIMEOUT_MS = 8000;

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
 * Shows a single full-screen interstitial ad, if one loads in time, then
 * resolves either way. This gates the "Empty Trash Now" bulk-delete
 * action specifically (not per-item restore) — unlike an opt-in rewarded
 * ad, which most users simply decline, tying it to a deliberate bulk
 * action the user already committed to gets real impressions without an
 * upfront "no thanks" button.
 *
 * Never rejects and never blocks longer than LOAD_TIMEOUT_MS: deletion
 * must still be able to proceed even if the ad network has no fill, is
 * slow, or the device is offline. An ad network hiccup breaking a core,
 * safety-critical action (the user already confirmed permanent deletion)
 * would be a real bug, not an acceptable monetization tradeoff — callers
 * should await this immediately before the delete, not depend on it
 * having actually shown anything.
 *
 * Requests non-personalized ads only: Swipix has no analytics or
 * tracking anywhere else, and personalized ads would mean pulling in
 * IDFA access and an App Tracking Transparency prompt this app doesn't
 * otherwise need.
 */
export async function showInterstitialAd(): Promise<void> {
  await ensureInitialized();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      unsubscribeLoaded();
      unsubscribeError();
      unsubscribeClosed();
      resolve();
    };

    // Only guards the load phase. Confirmed on a real device: if this timer
    // is left running for the ad's whole lifetime, an ad that takes longer
    // than LOAD_TIMEOUT_MS to load *and* be watched lets it fire while the
    // ad is still on screen — resolving this promise (and letting the
    // delete flow start) underneath a still-visible ad, stacking the native
    // "Allow Swipix to delete N photos?" dialog on top of it. Cleared the
    // moment the ad actually starts showing, so from then on only CLOSED/
    // ERROR can resolve, no matter how long the user watches.
    const timeoutId = setTimeout(finish, LOAD_TIMEOUT_MS);

    const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      clearTimeout(timeoutId);
      interstitial.show().catch(finish);
    });
    const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, finish);
    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, finish);

    interstitial.load();
  });
}
