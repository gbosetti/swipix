import { CategoryStrategy } from './CategoryStrategy';
import { analyzeImages } from '../services/ImageAnalysisService';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta, ScanContext } from '../types';
import i18n from '../i18n';

// 0 (sharp) - 100 (very blurry), from Laplacian-variance edge detection
// (see ImageAnalysisService). Calibrated against a real device library
// (issue #10): sharp photos scored a clean 0 with a gap up to ~37 for
// real blur signal, so 45 catches most blur without crossing into that gap.
const BLUR_THRESHOLD = 45;
// No native filter exists for "blurry" — real pixel decode, so the
// sample stays small with a bit more time than the default budget.
const PREVIEW_SAMPLE_SIZE = 15;

/**
 * Flags photos above a blur threshold — a genuine judgment call from
 * pixel data, so treat it as a hint to review, not an infallible verdict.
 */
export class BlurredImagesStrategy extends CategoryStrategy {
  async matchCandidates(assets: Asset[], context?: ScanContext): Promise<Asset[]> {
    // One bulk call, not one per photo — analyzeImages shares the decode
    // and caches by id.
    const analysis = await analyzeImages(assets, context?.onProgress);
    return assets.filter((asset) => (analysis.get(asset.id)?.blurScore ?? 0) > BLUR_THRESHOLD);
  }

  get meta(): CategoryMeta {
    return {
      id: 'blurred-images',
      title: i18n.t('categories.blurred-images'),
      icon: 'aperture',
    };
  }

  // A bit more than the default budget for real pixel decode, still
  // bounded so a slow device falls back to the icon.
  protected previewTimeoutMs = 4000;

  protected async findPreviewAsset(): Promise<Asset | null> {
    const candidates = await PhotoLibraryService.getPreviewCandidates({
      mediaTypes: this.mediaTypes,
      first: PREVIEW_SAMPLE_SIZE,
    });
    const matched = await this.matchCandidates(candidates);
    const undecided = await this.excludeDecided(matched);
    return undecided[0] ?? null;
  }
}
