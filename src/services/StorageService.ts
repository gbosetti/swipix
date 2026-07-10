import { getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';

export interface StorageInfo {
  freeBytes: number;
  totalBytes: number;
}

/**
 * Single source of truth for device disk-space info — same reusability
 * rule as PhotoLibraryService: nowhere else should import
 * expo-file-system directly for this.
 */
export const StorageService = {
  async getStorageInfo(): Promise<StorageInfo> {
    const [freeBytes, totalBytes] = await Promise.all([
      getFreeDiskStorageAsync(),
      getTotalDiskCapacityAsync(),
    ]);
    return { freeBytes, totalBytes };
  },
};
