import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeptService } from './KeptService';
import { Asset } from '../types';

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

describe('KeptService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts empty', async () => {
    await expect(KeptService.getKept()).resolves.toEqual([]);
  });

  it('addKept adds a photo', async () => {
    await KeptService.addKept(makeAsset('a'));
    const kept = await KeptService.getKept();
    expect(kept.map((item) => item.id)).toEqual(['a']);
  });

  it('addKept does not duplicate an already-kept photo', async () => {
    await KeptService.addKept(makeAsset('a'));
    await KeptService.addKept(makeAsset('a'));
    const kept = await KeptService.getKept();
    expect(kept).toHaveLength(1);
  });

  it('removeKept un-marks a photo without needing to know anything about trash', async () => {
    await KeptService.addKept(makeAsset('a'));
    await KeptService.removeKept('a');
    await expect(KeptService.getKept()).resolves.toEqual([]);
  });

  it('removeKept is a no-op for an id that was never kept', async () => {
    await KeptService.addKept(makeAsset('a'));
    await KeptService.removeKept('nonexistent');
    const kept = await KeptService.getKept();
    expect(kept.map((item) => item.id)).toEqual(['a']);
  });

  it('isKept reflects current membership', async () => {
    await KeptService.addKept(makeAsset('a'));
    await expect(KeptService.isKept('a')).resolves.toBe(true);
    await expect(KeptService.isKept('b')).resolves.toBe(false);
  });

  it('clearAll un-marks every kept photo at once', async () => {
    await KeptService.addKept(makeAsset('a'));
    await KeptService.addKept(makeAsset('b'));
    await KeptService.clearAll();
    await expect(KeptService.getKept()).resolves.toEqual([]);
  });
});
