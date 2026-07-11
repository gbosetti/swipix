export interface Asset {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  creationTime: number;
  duration: number; // seconds; 0 for photos
  width: number;
  height: number;
  mediaSubtypes: string[];
}

export interface TrashedAsset extends Asset {
  trashedAt: number;
}

export interface CategoryMeta {
  id: string;
  title: string;
  icon: string;
}
