import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { KeptService } from '../services/KeptService';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';

/**
 * Browsable list of every photo you've swiped right on, across every
 * category — same list-plus-preview shape as TrashScreen. The action
 * here is "Swipe Again," not "Restore" — nothing was ever done to the
 * photo itself; kept status only exists so category strategies stop
 * offering it as a candidate. Un-marking it just drops it back into the
 * normal, undecided pool, where it'll reappear next time a matching
 * category is swiped. No bulk "clear all" here, unlike Trash — there's
 * no safety/storage reason to ever force-empty a list of things you
 * chose to keep.
 */
export default function KeptScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [kept, setKept] = useState<Asset[] | null>(null);
  const [previewItem, setPreviewItem] = useState<Asset | null>(null);

  const refresh = useCallback(() => {
    KeptService.getKept().then(setKept);
  }, []);

  useFocusEffect(refresh);

  const handleSwipeAgain = async (assetId: string) => {
    await KeptService.removeKept(assetId);
    setPreviewItem((current) => (current?.id === assetId ? null : current));
    refresh();
  };

  if (kept === null) {
    return <View style={styles.container} />;
  }

  if (kept.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t('kept.emptyTitle')}</Text>
        <Text style={styles.emptySubText}>{t('kept.emptyBody')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={kept}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          // Same guard TrashScreen uses — ph:// isn't renderable by
          // <Image>, only info.localUri is.
          const hasRenderableUri = !item.uri.startsWith('ph://');
          return (
            <View style={styles.row}>
              <Pressable
                onPress={() => hasRenderableUri && setPreviewItem(item)}
                disabled={!hasRenderableUri}
              >
                {hasRenderableUri ? (
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                    <Text style={styles.placeholderText}>?</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.spacer} />
              <Pressable style={styles.swipeAgainButton} onPress={() => handleSwipeAgain(item.id)}>
                <Text style={styles.swipeAgainButtonText}>{t('kept.swipeAgain')}</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <Modal
        visible={previewItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}
      >
        <View style={styles.previewOverlay}>
          <Pressable
            style={styles.previewCloseButton}
            onPress={() => setPreviewItem(null)}
            hitSlop={12}
          >
            <Text style={styles.previewCloseButtonText}>✕</Text>
          </Pressable>
          {previewItem && (
            <>
              <Image
                source={{ uri: previewItem.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
              <Pressable
                style={styles.previewSwipeAgainButton}
                onPress={() => handleSwipeAgain(previewItem.id)}
              >
                <Text style={styles.swipeAgainButtonText}>{t('kept.swipeAgain')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 24,
      gap: 8,
    },
    emptyText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
    emptySubText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
    list: { padding: 16, gap: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 10,
    },
    thumbnail: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.placeholder },
    thumbnailPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    placeholderText: { color: colors.textSecondary, fontSize: 20, fontWeight: '700' },
    spacer: { flex: 1 },
    swipeAgainButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    swipeAgainButtonText: { color: colors.onBrand, fontSize: 13, fontWeight: '600' },
    previewOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewImage: { width: '100%', height: '75%' },
    previewCloseButton: {
      position: 'absolute',
      top: 60,
      left: 20,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    previewCloseButtonText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
    previewSwipeAgainButton: {
      marginTop: 20,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
  });
}
