import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrashService } from './TrashService';
import { PhotoLibraryService } from './PhotoLibraryService';
import { Asset } from '../types';

jest.mock('./PhotoLibraryService');

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;

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

describe('TrashService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('starts empty', async () => {
    await expect(TrashService.getTrash()).resolves.toEqual([]);
  });

  it('moveToTrash stages a photo with a trashedAt timestamp, without deleting it', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    const trash = await TrashService.getTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe('a');
    expect(typeof trash[0].trashedAt).toBe('number');
    expect(mockedPhotoLibraryService.deleteAssets).not.toHaveBeenCalled();
  });

  it('moveToTrash upserts by id instead of duplicating an entry (regression: a self-fetching category strategy could hand the same photo to SwipeDeck twice, and trashing it both times used to create two entries with the same id, breaking list rendering)', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    await TrashService.moveToTrash(makeAsset('a'));
    const trash = await TrashService.getTrash();
    expect(trash).toHaveLength(1);
    expect(trash.map((item) => item.id)).toEqual(['a']);
  });

  it('self-heals duplicate ids already sitting in storage from before moveToTrash upserted (regression: "two children with the same key" on Trash)', async () => {
    await AsyncStorage.setItem(
      '@swipix/trash',
      JSON.stringify([
        { ...makeAsset('a'), trashedAt: 1 },
        { ...makeAsset('b'), trashedAt: 2 },
        { ...makeAsset('a'), trashedAt: 3 },
      ])
    );
    const trash = await TrashService.getTrash();
    expect(trash).toHaveLength(2);
    expect(new Set(trash.map((item) => item.id))).toEqual(new Set(['a', 'b']));
  });

  it('restore removes a photo from the trash without deleting it from the device', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    await TrashService.restore('a');
    await expect(TrashService.getTrash()).resolves.toEqual([]);
    expect(mockedPhotoLibraryService.deleteAssets).not.toHaveBeenCalled();
  });

  it('restore is a no-op for an id that was never trashed', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    await TrashService.restore('nonexistent');
    const trash = await TrashService.getTrash();
    expect(trash.map((item) => item.id)).toEqual(['a']);
  });

  it('permanentlyDelete calls PhotoLibraryService.deleteAssets and clears the deleted ids from trash bookkeeping', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    await TrashService.moveToTrash(makeAsset('b'));
    mockedPhotoLibraryService.deleteAssets.mockResolvedValue(undefined);

    await TrashService.permanentlyDelete(['a']);

    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenCalledWith(['a']);
    const trash = await TrashService.getTrash();
    expect(trash.map((item) => item.id)).toEqual(['b']);
  });

  it('permanentlyDelete leaves trash bookkeeping untouched when the underlying device deletion fails (regression: a failed delete must never look like a successful one)', async () => {
    await TrashService.moveToTrash(makeAsset('a'));
    mockedPhotoLibraryService.deleteAssets.mockRejectedValue(new Error('cancelled'));

    await expect(TrashService.permanentlyDelete(['a'])).rejects.toThrow('cancelled');

    const trash = await TrashService.getTrash();
    expect(trash.map((item) => item.id)).toEqual(['a']);
  });

  it('splits a large bulk delete into batches of 50 instead of one native call (regression: issue #11 — a single huge call risks hanging/crashing on 100+ items)', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    for (const id of ids) await TrashService.moveToTrash(makeAsset(id));
    mockedPhotoLibraryService.deleteAssets.mockResolvedValue(undefined);

    await TrashService.permanentlyDelete(ids);

    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenCalledTimes(3);
    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenNthCalledWith(1, ids.slice(0, 50));
    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenNthCalledWith(2, ids.slice(50, 100));
    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenNthCalledWith(3, ids.slice(100, 120));
    await expect(TrashService.getTrash()).resolves.toEqual([]);
  });

  it('reports progress after each batch completes', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    for (const id of ids) await TrashService.moveToTrash(makeAsset(id));
    mockedPhotoLibraryService.deleteAssets.mockResolvedValue(undefined);
    const onProgress = jest.fn();

    await TrashService.permanentlyDelete(ids, onProgress);

    expect(onProgress).toHaveBeenNthCalledWith(1, 50, 120);
    expect(onProgress).toHaveBeenNthCalledWith(2, 100, 120);
    expect(onProgress).toHaveBeenNthCalledWith(3, 120, 120);
  });

  it('keeps already-deleted batches out of trash bookkeeping even when a later batch fails (regression: a mid-way cancellation must not resurrect or strand already-deleted photos)', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    for (const id of ids) await TrashService.moveToTrash(makeAsset(id));
    mockedPhotoLibraryService.deleteAssets
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cancelled'));

    await expect(TrashService.permanentlyDelete(ids)).rejects.toThrow('cancelled');

    expect(mockedPhotoLibraryService.deleteAssets).toHaveBeenCalledTimes(2);
    const trash = await TrashService.getTrash();
    expect(trash.map((item) => item.id)).toEqual(ids.slice(50));
  });
});
