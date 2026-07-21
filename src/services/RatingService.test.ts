import { requestAppReview } from './RatingService';
import * as StoreReview from 'expo-store-review';

jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(),
  requestReview: jest.fn(),
}));

const mockedHasAction = StoreReview.hasAction as jest.MockedFunction<typeof StoreReview.hasAction>;
const mockedRequestReview = StoreReview.requestReview as jest.MockedFunction<typeof StoreReview.requestReview>;

describe('requestAppReview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests a review when the platform supports it', async () => {
    mockedHasAction.mockResolvedValue(true);
    mockedRequestReview.mockResolvedValue(undefined);
    await requestAppReview();
    expect(mockedRequestReview).toHaveBeenCalled();
  });

  it('does not attempt a review when the platform has no review action available', async () => {
    mockedHasAction.mockResolvedValue(false);
    await requestAppReview();
    expect(mockedRequestReview).not.toHaveBeenCalled();
  });

  it('never throws, even if the native call rejects (regression: a rate-limited or unsupported device must not crash the tap)', async () => {
    mockedHasAction.mockResolvedValue(true);
    mockedRequestReview.mockRejectedValue(new Error('unavailable'));
    await expect(requestAppReview()).resolves.toBeUndefined();
  });
});
