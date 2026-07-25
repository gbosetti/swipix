import { InterstitialAd } from 'react-native-google-mobile-ads';
import { showInterstitialAd } from './AdService';

/** Mocks the whole SDK — it's a native module that can't run in Jest,
 * and the actual behavior worth testing here is Swipix's own wrapper
 * logic (never blocking, never rejecting), not the SDK itself. Built as
 * a small manual event emitter so tests can trigger LOADED/ERROR/CLOSED
 * on demand, the same way the real native module would via events. */
const mockPlayer = {
  addAdEventListener: jest.fn(),
  show: jest.fn(),
  load: jest.fn(),
};
const listeners: Record<string, () => void> = {};

jest.mock('react-native-google-mobile-ads', () => {
  const mockAdEventType = { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' };
  return {
    __esModule: true,
    default: jest.fn(() => ({ initialize: jest.fn().mockResolvedValue(undefined) })),
    AdEventType: mockAdEventType,
    TestIds: { INTERSTITIAL: 'test-interstitial-id' },
    InterstitialAd: {
      createForAdRequest: jest.fn((_adUnitId: string, _options: unknown) => ({
        addAdEventListener: (type: string, listener: () => void) => {
          listeners[type] = listener;
          return jest.fn();
        },
        show: mockPlayer.show,
        load: mockPlayer.load,
      })),
    },
  };
});

describe('showInterstitialAd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    Object.keys(listeners).forEach((key) => delete listeners[key]);
    mockPlayer.show.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the ad loads, shows, and closes normally', async () => {
    const promise = showInterstitialAd();
    await Promise.resolve(); // let ensureInitialized()'s await settle
    await Promise.resolve();
    listeners.loaded();
    await Promise.resolve();
    listeners.closed();
    await expect(promise).resolves.toBeUndefined();
    expect(mockPlayer.show).toHaveBeenCalled();
  });

  it('resolves (does not reject) when the ad fails to load', async () => {
    const promise = showInterstitialAd();
    await Promise.resolve();
    await Promise.resolve();
    listeners.error();
    await expect(promise).resolves.toBeUndefined();
    expect(mockPlayer.show).not.toHaveBeenCalled();
  });

  it('resolves after the load timeout even if no event ever fires (regression: a stuck ad network must never block the action it gates)', async () => {
    const promise = showInterstitialAd();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(8000);
    await expect(promise).resolves.toBeUndefined();
    expect(mockPlayer.show).not.toHaveBeenCalled();
  });

  it('does not resolve on the load timeout once the ad is already showing (regression: this used to let the delete flow start underneath a still-visible ad)', async () => {
    const promise = showInterstitialAd();
    await Promise.resolve();
    await Promise.resolve();
    listeners.loaded();
    await Promise.resolve();
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    jest.advanceTimersByTime(8000);
    await Promise.resolve();
    expect(resolved).toBe(false);
    listeners.closed();
    await expect(promise).resolves.toBeUndefined();
  });

  it('requests non-personalized ads only', async () => {
    const promise = showInterstitialAd();
    await Promise.resolve();
    await Promise.resolve();
    listeners.error(); // settle the promise so the test doesn't hang
    await promise;
    expect(InterstitialAd.createForAdRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ requestNonPersonalizedAdsOnly: true })
    );
  });
});
