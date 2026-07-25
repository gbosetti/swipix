import { CategoryStrategy } from './CategoryStrategy';
import { analyzeImages } from '../services/ImageAnalysisService';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { Asset, CategoryMeta } from '../types';
import i18n from '../i18n';

// 0 (sharp) - 100 (very blurry). Backed by real Laplacian-variance edge
// detection now (see ImageAnalysisService), not a stub. Calibrated
// against a real device library (see issue #10): genuinely sharp photos
// scored a clean 0 with a big gap up to ~37 for anything with real blur
// signal, so 45 catches most photos with a clear blur signal without
// crossing into that gap — still a judgment call, not an exact science.
const BLUR_THRESHOLD = 45;
// No native filter exists for "blurry" — this is real pixel decode +
// analysis, so the preview sample stays small and gets a bit more time
// than the default template-method budget (see previewTimeoutMs below).
const PREVIEW_SAMPLE_SIZE = 15;

/**
 * Flags photos above a blur threshold. Unlike Screenshots or file-size
 * categories, there's no metadata shortcut for this — it's a genuine
 * judgment call from pixel data, so treat it as a strong hint to review,
 * not an infallible verdict.
 */
export class BlurredImagesStrategy extends CategoryStrategy {
  async matchCandidates(assets: Asset[]): Promise<Asset[]> {
    // One bulk call, not one await per photo — see BrightnessStrategy's
    // matching comment; analyzeImages shares the decode and caches by id.
    const analysis = await analyzeImages(assets);
    return assets.filter((asset) => (analysis.get(asset.id)?.blurScore ?? 0) > BLUR_THRESHOLD);
  }

  get meta(): CategoryMeta {
    return {
      id: 'blurred-images',
      title: i18n.t('categories.blurred-images'),
      icon: 'aperture',
    };
  }

  // A bit more than the default budget — real pixel decode, not a metadata
  // check — but still bounded, so a slow device falls back to the icon
  // rather than holding up the rest of the screen.
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
