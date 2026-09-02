import { CategoryStrategy } from './CategoryStrategy';
import { analyzeImages } from '../services/ImageAnalysisService';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

/** See BlurredImagesStrategy's identical constants. */
const PREVIEW_SAMPLE_SIZE = 15;

/**
 * Flags photos within a brightness range — a cheap, deterministic
 * pixel-average, no ML involved, so it's the category to lead with.
 */
export class BrightnessStrategy extends CategoryStrategy {
  minBrightness: number;
  maxBrightness: number;

  constructor(minBrightness = 0, maxBrightness = 70) {
    super();
    this.minBrightness = minBrightness; /** 0-255 scale */
    this.maxBrightness = maxBrightness;
  }

  async matchCandidates(assets: Asset[], context?: ScanContext): Promise<Asset[]> {
    /**
     * One bulk call, not one per photo — analyzeImages shares a decode
     * across brightness/blur/duplicate-hash and caches by asset id.
     */
    const analysis = await analyzeImages(assets, context?.onProgress);
    return assets.filter((asset) => {
      const brightness = analysis.get(asset.id)?.brightness;
      return (
        brightness !== undefined &&
        brightness >= this.minBrightness &&
        brightness <= this.maxBrightness
      );
    });
  }

  get meta(): CategoryMeta {
    return {
      id: 'dark-photos',
      title: i18n.t('categories.dark-photos'),
      icon: 'moon',
    };
  }

  protected previewTimeoutMs = 4000;

  protected async findPreviewAsset(context?: ScanContext): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      first: PREVIEW_SAMPLE_SIZE,
      priority: context?.priority,
      isCancelled: context?.isCancelled,
    });
    const matched = await this.matchCandidates(candidates, context);
    const undecided = await this.excludeDecided(matched);
    return undecided[0] ?? null;
  }
}
