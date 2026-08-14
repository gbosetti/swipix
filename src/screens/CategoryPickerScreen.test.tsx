import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import CategoryPickerScreen from './CategoryPickerScreen';
import { ThemeProvider } from '../theme/ThemeContext';
import { PhotoLibraryService } from '../services/PhotoLibraryService';
import { TrashService } from '../services/TrashService';

// A render crash here (hook misuse, undefined access, a missing provider)
// is exactly the class of bug unit tests on strategies/services can't
// catch — this screen mounts on every app launch, so a crash here is a
// crash-on-every-reload, not just a broken category.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: jest.fn(() => ({})) }));
jest.mock('expo-video', () => ({ VideoView: 'VideoView', useVideoPlayer: jest.fn(() => ({})) }));

jest.mock('../services/PhotoLibraryService', () => ({
  PhotoLibraryService: {
    requestPermission: jest.fn(),
    getAlbums: jest.fn().mockResolvedValue([]),
    getPreviewCandidates: jest.fn().mockResolvedValue([]),
    getAllMedia: jest.fn().mockResolvedValue([]),
    /**
     * Small library — under the expensive-preview threshold, so the
     * Duplicates/Big Pictures/Big Videos cards still render for real
     * instead of silently skipping their preview lookup.
     */
    getLibrarySize: jest.fn().mockResolvedValue(50),
  },
}));
jest.mock('../services/TrashService', () => ({
  TrashService: { getTrash: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../services/KeptService', () => ({
  KeptService: { getKept: jest.fn().mockResolvedValue([]) },
}));

const mockedPhotoLibraryService = PhotoLibraryService as jest.Mocked<typeof PhotoLibraryService>;
const mockedTrashService = TrashService as jest.Mocked<typeof TrashService>;

function renderCategoryPickerScreen() {
  const navigation = { navigate: jest.fn() };
  const route = { key: 'CategoryPicker', name: 'CategoryPicker' as const };
  return render(
    <NavigationContainer>
      <ThemeProvider>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CategoryPickerScreen navigation={navigation as any} route={route as any} />
      </ThemeProvider>
    </NavigationContainer>
  );
}

describe('CategoryPickerScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders every category card without crashing when photo access is granted', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(true);
    mockedTrashService.getTrash.mockResolvedValue([]);

    renderCategoryPickerScreen();

    await waitFor(() => expect(screen.getByText('categoryPicker.picturesSectionHeader')).toBeTruthy());
    expect(screen.getByText('categoryPicker.videosSectionHeader')).toBeTruthy();
  });

  it('renders without crashing when photo access is denied', async () => {
    mockedPhotoLibraryService.requestPermission.mockResolvedValue(false);

    renderCategoryPickerScreen();

    await waitFor(() => expect(screen.getByText('categoryPicker.picturesSectionHeader')).toBeTruthy());
  });
});
