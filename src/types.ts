export interface Asset {
  id: string;
  uri: string;
  creationTime: number;
  mediaSubtypes: string[];
  location: { latitude: number; longitude: number } | null;
}

export interface TrashedAsset extends Asset {
  trashedAt: number;
}

export interface CategoryMeta {
  id: string;
  title: string;
  icon: string;
}
