import { Asset, CategoryMeta } from '../types';

/**
 * CategoryStrategy — the contract every "category" (Dark Photos,
 * Screenshots...) must implement.
 *
 * Why an interface instead of a big switch statement?
 * Because adding a new category should NEVER require touching SwipeDeck,
 * SwipeScreen, or any other existing strategy. Open for extension,
 * closed for modification (the Open-Closed Principle).
 *
 * Each strategy is responsible for exactly two things:
 *   1. Deciding which photos belong in this category (`match`)
 *   2. Describing itself for the UI (`meta`)
 */
export abstract class CategoryStrategy {
  abstract match(assets: Asset[]): Promise<Asset[]>;
  abstract get meta(): CategoryMeta;
}
