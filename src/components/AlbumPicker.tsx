import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { Album } from '../services/PhotoLibraryService';

interface AlbumPickerProps {
  albums: Album[] | null;
  selectedAlbumId: string | null;
  onChange: (albumId: string) => void;
}

/**
 * The interactive control under the "By Album" card — same role as
 * MonthYearPicker, but a full list instead of a ‹ › stepper, since albums
 * have no natural ordering the way months do and there can be many of
 * them. Shows the currently selected album's name; tapping it opens a
 * sheet listing every album (with its photo count) to switch to.
 */
export default function AlbumPicker({ albums, selectedAlbumId, onChange }: AlbumPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const selected = albums?.find((album) => album.id === selectedAlbumId) ?? null;
  const isLoading = albums === null;
  const isEmpty = albums !== null && albums.length === 0;

  return (
    <>
      <Pressable
        style={styles.row}
        onPress={() => setOpen(true)}
        disabled={isLoading || isEmpty}
        hitSlop={4}
      >
        <Text style={styles.label} numberOfLines={1}>
          {isLoading
            ? t('categoryPicker.loadingAlbums')
            : isEmpty
              ? t('categoryPicker.noAlbums')
              : (selected?.title ?? t('categoryPicker.chooseAlbum'))}
        </Text>
        {!isLoading && !isEmpty && (
          <Ionicons name="chevron-expand" size={16} color={colors.textSecondary} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('categoryPicker.chooseAlbum')}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>
            <FlatList
              data={albums ?? []}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.albumRow}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.albumCount}>{item.assetCount}</Text>
                  {item.id === selectedAlbumId && (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      marginBottom: 4,
    },
    label: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: 20,
      maxHeight: '70%',
      overflow: 'hidden',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.trackInactive,
    },
    sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
    closeButton: { color: colors.textSecondary, fontSize: 18 },
    list: { flexGrow: 0 },
    albumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.trackInactive,
    },
    albumTitle: { flex: 1, color: colors.textPrimary, fontSize: 16 },
    albumCount: { color: colors.textSecondary, fontSize: 14 },
  });
}
