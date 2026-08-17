import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert, Modal, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TrashService, DELETE_BATCH_SIZE } from '../services/TrashService';
import { getVideoThumbnail } from '../services/VideoThumbnailService';
import { showInterstitialAd, MIN_AD_WAIT_MS } from '../services/AdService';
import { TrashedAsset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import { useBulkOperation } from '../navigation/BulkOperationContext';
import VideoCard from '../components/VideoCard';
import AdUnavailableOverlay from '../components/AdUnavailableOverlay';

/**
 * Lets the user see exactly what's staged for deletion and restore
 * individual photos — without this, "pending deletion" is just a number
 * with no way back, which defeats the point of staging deletions instead
 * of applying them immediately.
 */
export default function TrashScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trash, setTrash] = useState<TrashedAsset[] | null>(null);
  const [previewItem, setPreviewItem] = useState<TrashedAsset | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, VideoThumbnail | null>>({});
  // True until the whole ad+delete flow settles — showInterstitialAd can
  // take up to ~8s, and a silent wait that long reads as broken.
  const [emptying, setEmptying] = useState(false);
  // Large trash counts delete in batches, each with its own native
  // confirmation — worth surfacing progress, not one opaque spinner.
  const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  // Tracks which restore is in flight so its button shows a spinner and
  // ignores repeat taps.
  const [restoringId, setRestoringId] = useState<string | null>(null);
  /**
   * Drives AdUnavailableOverlay — separate from `emptying` since it only
   * covers the ad-request phase, not the delete itself.
   */
  const [awaitingAd, setAwaitingAd] = useState(false);
  const { setBulkDeleteInProgress } = useBulkOperation();

  const refresh = useCallback(() => {
    TrashService.getTrash().then(setTrash);
  }, []);

  useFocusEffect(refresh);

  // The preview modal below can mount a real, playing VideoCard — without
  // this, switching tabs while a preview video is open would leave it
  // playing (with sound) on a screen the user can no longer even see,
  // same root cause as the identical SwipeScreen bug.
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );

  // Extracts one frame per video item once, caching it here — only for
  // items not already generated.
  useEffect(() => {
    if (!trash) {
      return;
    }
    const pending = trash.filter(
      (item) => item.mediaType === 'video' && !(item.id in videoThumbnails)
    );
    if (pending.length === 0) {
      return;
    }
    pending.forEach((item) => {
      getVideoThumbnail(item.uri).then((thumbnail) => {
        setVideoThumbnails((current) => ({ ...current, [item.id]: thumbnail }));
      });
    });
    // Excludes videoThumbnails deliberately — including it would re-run
    // this on every thumbnail just added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trash]);

  const handleRestore = async (assetId: string) => {
    if (restoringId) {
      return;
    }
    setRestoringId(assetId);
    try {
      await TrashService.restore(assetId);
      setPreviewItem((current) => (current?.id === assetId ? null : current));
      refresh();
    } finally {
      setRestoringId(null);
    }
  };

  const handleEmptyAll = () => {
    if (!trash || trash.length === 0) {
      return;
    }
    // Deletion chunks into DELETE_BATCH_SIZE-sized native calls, each
    // with its own OS confirmation — noted here so multiple confirmations
    // don't read as the app asking twice by mistake.
    const body =
      trash.length > DELETE_BATCH_SIZE
        ? `${t('trash.emptyAllBody', { count: trash.length })} ${t('trash.emptyAllBatchNote', { batchSize: DELETE_BATCH_SIZE })}`
        : t('trash.emptyAllBody', { count: trash.length });
    Alert.alert(
      t('trash.emptyAllTitle'),
      body,
      [
        { text: t('trash.cancel'), style: 'cancel' },
        {
          text: t('trash.delete'),
          style: 'destructive',
          onPress: async () => {
            // showInterstitialAd always resolves within its own timeout,
            // so this delays at most a few seconds. setBulkDeleteInProgress
            // blocks switching tabs for the same window — without it, a
            // delete confirmation could surface on top of an unrelated
            // screen the user has already navigated to.
            setEmptying(true);
            setBulkDeleteInProgress(true);
            try {
              const adShown = await showInterstitialAd();
              if (!adShown) {
                setAwaitingAd(true);
                await new Promise((resolve) => setTimeout(resolve, MIN_AD_WAIT_MS));
                setAwaitingAd(false);
              }
              try {
                await TrashService.permanentlyDelete(
                  trash.map((item) => item.id),
                  (done, total) => setDeleteProgress({ done, total })
                );
              } catch {
                // Cancelled or failed — trash bookkeeping stays untouched.
              }
              refresh();
            } finally {
              setEmptying(false);
              setAwaitingAd(false);
              setDeleteProgress(null);
              setBulkDeleteInProgress(false);
            }
          },
        },
      ]
    );
  };

  if (trash === null) {
    return <View style={styles.container} />;
  }

  if (trash.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t('trash.emptyTitle')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={trash}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isVideo = item.mediaType === 'video';
          const videoThumbnail = videoThumbnails[item.id];
          return (
            <View style={styles.row}>
              <Pressable onPress={() => setPreviewItem(item)}>
                {isVideo ? (
                  videoThumbnail ? (
                    <Image source={videoThumbnail} style={styles.thumbnail} contentFit="cover" />
                  ) : (
                    // Still extracting the frame, or extraction failed.
                    <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                      <Ionicons name="videocam" size={22} color={colors.textSecondary} />
                    </View>
                  )
                ) : (
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} contentFit="cover" />
                )}
              </Pressable>
              <Text style={styles.rowText}>{t('trash.pendingDeletion')}</Text>
              <Pressable
                style={[styles.restoreButton, restoringId === item.id && styles.restoreButtonDisabled]}
                onPress={() => handleRestore(item.id)}
                disabled={restoringId !== null}
              >
                {restoringId === item.id ? (
                  <ActivityIndicator color={colors.onBrand} size="small" />
                ) : (
                  <Text style={styles.restoreButtonText}>{t('trash.restore')}</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      <Text style={styles.adSupportNote}>{t('trash.adSupportNote')}</Text>
      <Pressable
        style={[styles.emptyButton, emptying && styles.emptyButtonDisabled]}
        onPress={handleEmptyAll}
        disabled={emptying}
      >
        {emptying ? (
          <View style={styles.emptyingProgress}>
            <ActivityIndicator color={colors.onBrand} />
            {deleteProgress && (
              <Text style={styles.emptyButtonText}>
                {t('trash.deletingProgress', deleteProgress)}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.emptyButtonText}>{t('trash.emptyTrashNow')}</Text>
        )}
      </Pressable>

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
              {previewItem.mediaType === 'video' ? (
                <View style={styles.previewImage}>
                  <VideoCard asset={previewItem} isTop screenFocused={screenFocused} />
                </View>
              ) : (
                <Image
                  source={{ uri: previewItem.uri }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              )}
              <Pressable
                style={[
                  styles.previewRestoreButton,
                  restoringId === previewItem.id && styles.restoreButtonDisabled,
                ]}
                onPress={() => handleRestore(previewItem.id)}
                disabled={restoringId !== null}
              >
                {restoringId === previewItem.id ? (
                  <ActivityIndicator color={colors.onBrand} size="small" />
                ) : (
                  <Text style={styles.restoreButtonText}>{t('trash.restore')}</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </Modal>

      <AdUnavailableOverlay visible={awaitingAd} label={t('trash.adUnavailable')} />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    emptyText: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
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
    rowText: { flex: 1, color: colors.textPrimary, fontSize: 14 },
    restoreButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    restoreButtonText: { color: colors.onBrand, fontSize: 13, fontWeight: '600' },
    restoreButtonDisabled: { opacity: 0.6 },
    adSupportNote: {
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 16,
      marginHorizontal: 24,
    },
    emptyButton: {
      marginTop: 8,
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.danger,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    emptyButtonDisabled: { opacity: 0.6 },
    emptyButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: '600' },
    emptyingProgress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
    previewRestoreButton: {
      marginTop: 20,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
  });
}
