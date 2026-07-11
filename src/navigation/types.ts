import { CategoryStrategy } from '../strategies/CategoryStrategy';

export type SwipeRouteParams = { strategy: CategoryStrategy };

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

export type SettingsStackParamList = {
  Settings: undefined;
  Terms: undefined;
  Privacy: undefined;
  Language: undefined;
};

export type RootTabParamList = {
  CategoriesTab: undefined;
  SwipeTab: undefined;
  TrashTab: undefined;
  SettingsTab: undefined;
};
