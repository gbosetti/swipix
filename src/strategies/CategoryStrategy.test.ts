import { CategoryStrategy } from './CategoryStrategy';
import { TrashService } from '../services/TrashService';
import { KeptService } from '../services/KeptService';
import { Asset, CategoryMeta, TrashedAsset } from '../types';

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

/** A trivial concrete subclass — CategoryStrategy itself is abstract, and
 * `match()`'s trash/kept exclusion is the thing under test here, not any
 * particular category's own matching logic. */
class PassThroughStrategy extends CategoryStrategy {
  constructor(private readonly candidates: Asset[]) {
    super();
  }

  protected async matchCandidates(): Promise<Asset[]> {
    return this.candidates;
  }

  get meta(): CategoryMeta {
    return { id: 'test', title: 'Test', icon: 'copy' };
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
});
