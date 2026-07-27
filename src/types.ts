import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export interface Asset {
  id: string;
  /** For a video, always the raw `ph://` reference, never a resolved
   * `file://` path — expo-video's own docs say not to use
   * getAssetInfoAsync's `localUri` for video playback: iOS's sandbox
   * denies `mediaserverd` read access to it (confirmed on a real device,
   * a known expo-media-library issue). Photos are unaffected; a detailed
   * photo fetch still resolves `uri` to a real local path. */
  uri: string;
  mediaType: 'photo' | 'video';
  creationTime: number;
  duration: number; // seconds; 0 for photos
  width: number;
  height: number;
  mediaSubtypes: string[];
  /** A resolved local `file://` path for a video from a detailed fetch —
   * only for callers that need real file bytes (e.g. file-size checks).
   * Never for playback; see `uri`. Undefined for photos (their `uri` is
   * already the resolved path when detailed) and for any non-detailed
   * video fetch. */
  localUri?: string;
}

export interface TrashedAsset extends Asset {
  trashedAt: number;
}

export interface CategoryMeta {
  id: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}

export type MediaTypeFilter = 'photo' | 'video';

/** Fires as a scan progresses — `total` is fixed once known for that
 * particular scan (a fetch batch, or an analysis pass). */
export type ScanProgressCallback = (done: number, total: number) => void;

/** 'high' jumps native-call queues ahead of already-waiting 'low'
 * requests — see PhotoLibraryService's internal concurrency pool. */
export type CallPriority = 'high' | 'low';

/** Bundles the three concerns a self-fetching/self-scanning strategy
 * needs from its caller, instead of stacking them as separate positional
 * params. */
export interface ScanContext {
  onProgress?: ScanProgressCallback;
  priority?: CallPriority;
  /** Checked before dispatching each not-yet-started native call — see
   * PhotoLibraryService.getMediaPage's `isCancelled`. */
  isCancelled?: () => boolean;
}
