import { StrategyId } from '../strategies/strategyRegistry';

/** Plain, serializable — see strategyRegistry.ts's createStrategy, which
 * SwipeScreen uses to turn this back into a real CategoryStrategy. */
export type SwipeRouteParams = { strategyId: StrategyId; params?: Record<string, number> };

export type CategoriesStackParamList = {
  CategoryPicker: undefined;
  Swipe: SwipeRouteParams;
};

export type SwipeTabStackParamList = {
  Swipe: SwipeRouteParams;
};

export type TrashStackParamList = {
  Trash: undefined;
};

export type KeptStackParamList = {
  Kept: undefined;
};

export type SettingsStackParamList = {
  Settings: undefined;
  Terms: undefined;
  Privacy: undefined;
  Language: undefined;
  Appearance: undefined;
};

export type RootTabParamList = {
  CategoriesTab: undefined;
  SwipeTab: undefined;
  TrashTab: undefined;
  KeptTab: undefined;
  SettingsTab: undefined;
};
