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
});
