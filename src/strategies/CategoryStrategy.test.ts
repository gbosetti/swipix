import { CategoryStrategy } from './CategoryStrategy';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';
import { Asset, CategoryMeta, ScanContext, ScanProgressCallback, TrashedAsset } from '../types';

jest.mock('../services/TrashService');
jest.mock('../services/KeptService');

const mockedTrashService = TrashService as jest.Mocked<typeof TrashService>;
const mockedKeptService = KeptService as jest.Mocked<typeof KeptService>;

function makeAsset(id: string): Asset {
  return {
    id,
    uri: `file:///${id}.jpg`,
    mediaType: 'photo',
    creationTime: 0,
    duration: 0,
    width: 100,
    height: 100,
    mediaSubtypes: [],
  };
}

function makeTrashedAsset(id: string): TrashedAsset {
  return { ...makeAsset(id), trashedAt: Date.now() };
}

/**
 * A trivial concrete subclass — CategoryStrategy itself is abstract, and
 * `match()`'s trash/kept exclusion is the thing under test here, not any
 * particular category's own matching logic.
 */
class PassThroughStrategy extends CategoryStrategy {
  lastOnScanProgress: ScanProgressCallback | undefined;

  constructor(private readonly candidates: Asset[]) {
    super();
  }

  protected async matchCandidates(_assets: Asset[], context?: ScanContext): Promise<Asset[]> {
    this.lastOnScanProgress = context?.onProgress;
    return this.candidates;
  }

  get meta(): CategoryMeta {
    return { id: 'test', title: 'Test', icon: 'copy' };
  }

  protected async findPreviewAsset(): Promise<Asset | null> {
    return this.candidates[0] ?? null;
  }
}

/**
 * Exercises getPreview()'s template method itself — bounded wait,
 * survives a strategy-specific error, excludes decided assets — using a
 * subclass whose findPreviewAsset is fully controlled by the test.
 */
class ControllablePreviewStrategy extends CategoryStrategy {
  constructor(private readonly impl: () => Promise<Asset | null>) {
    super();
  }

  protected async matchCandidates(): Promise<Asset[]> {
    return [];
  }

  get meta(): CategoryMeta {
    return { id: 'test-preview', title: 'Test Preview', icon: 'copy' };
  }

  protected previewTimeoutMs = 3000;

  protected async findPreviewAsset(): Promise<Asset | null> {
    return this.impl();
  }
}

describe('CategoryStrategy.match', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrashService.getTrash.mockResolvedValue([]);
    mockedKeptService.getKept.mockResolvedValue([]);
  });

  it('returns all matchCandidates() results when nothing is trashed or kept', async () => {
    const assets = [makeAsset('a'), makeAsset('b')];
    const strategy = new PassThroughStrategy(assets);
    await expect(strategy.match([])).resolves.toEqual(assets);
  });

  it('excludes assets that are already in the trash', async () => {
    mockedTrashService.getTrash.mockResolvedValue([makeTrashedAsset('a')]);
    const assets = [makeAsset('a'), makeAsset('b')];
    const strategy = new PassThroughStrategy(assets);
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['b']);
  });

  it('excludes assets that are already kept', async () => {
    mockedKeptService.getKept.mockResolvedValue([makeAsset('b')]);
    const assets = [makeAsset('a'), makeAsset('b')];
    const strategy = new PassThroughStrategy(assets);
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['a']);
  });

  it('excludes assets that are both trashed and kept simultaneously (regression: photos must never silently resurface after a decision)', async () => {
    mockedTrashService.getTrash.mockResolvedValue([makeTrashedAsset('a')]);
    mockedKeptService.getKept.mockResolvedValue([makeAsset('b')]);
    const assets = [makeAsset('a'), makeAsset('b'), makeAsset('c')];
    const strategy = new PassThroughStrategy(assets);
    const result = await strategy.match([]);
    expect(result.map((a) => a.id)).toEqual(['c']);
  });

  it('forwards onScanProgress through to matchCandidates', async () => {
    const strategy = new PassThroughStrategy([]);

    const onScanProgress = jest.fn();
    await strategy.match([], { onProgress: onScanProgress });
    expect(strategy.lastOnScanProgress).toBe(onScanProgress);
  });
});

describe('CategoryStrategy.getPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrashService.getTrash.mockResolvedValue([]);
    mockedKeptService.getKept.mockResolvedValue([]);
  });

  it('resolves with whatever findPreviewAsset finds', async () => {
    const asset = makeAsset('a');
    const strategy = new ControllablePreviewStrategy(async () => asset);
    await expect(strategy.getPreview()).resolves.toEqual(asset);
  });

  it('resolves to null (not rejects) when findPreviewAsset throws (regression: a bad native query for one category must never crash the Categories screen)', async () => {
    const strategy = new ControllablePreviewStrategy(async () => {
      throw new Error('native failure');
    });
    await expect(strategy.getPreview()).resolves.toBeNull();
  });

  it('falls back to null after the timeout if findPreviewAsset never resolves (regression: a slow category — e.g. Duplicates & Similar — must never block its own preview forever)', async () => {
    jest.useFakeTimers();
    const strategy = new ControllablePreviewStrategy(() => new Promise(() => {}));
    const promise = strategy.getPreview();
    jest.advanceTimersByTime(3000);
    await expect(promise).resolves.toBeNull();
    jest.useRealTimers();
  });
});
