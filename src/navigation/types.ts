import { CategoryStrategy } from '../strategies/CategoryStrategy';

export type RootStackParamList = {
  CategoryPicker: undefined;
  Swipe: { strategy: CategoryStrategy };
  Trash: undefined;
};
