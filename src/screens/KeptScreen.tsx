import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Modal, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { KeptService } from '../services/KeptService';
import { getVideoThumbnail } from '../services/VideoThumbnailService';
import { showInterstitialAd, MIN_AD_WAIT_MS } from '../services/AdService';
import { Asset } from '../types';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/ThemeContext';
import VideoCard from '../components/VideoCard';
import AdUnavailableOverlay from '../components/AdUnavailableOverlay';

/**
 * Every photo swiped right, across every category — same shape as
 * TrashScreen, but "Swipe Again" instead of "Restore": kept status only
 * stops a strategy from offering it as a candidate, nothing was done to
 * the photo itself. The bulk action isn't destructive, so it skips
 * Trash's scary/red confirmation styling.
 */
export default function KeptScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [kept, setKept] = useState<Asset[] | null>(null);
  const [previewItem, setPreviewItem] = useState<Asset | null>(null);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, VideoThumbnail | null>>({});
  // Same reasoning as TrashScreen's `emptying`/`restoringId`.
  const [swipingAgainAll, setSwipingAgainAll] = useState(false);
  const [swipingAgainId, setSwipingAgainId] = useState<string | null>(null);
  /** Drives AdUnavailableOverlay — same reasoning as TrashScreen's `awaitingAd`. */
  const [awaitingAd, setAwaitingAd] = useState(false);

  const refresh = useCallback(() => {
    KeptService.getKept().then(setKept);
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

  // Same caching approach as TrashScreen.
  useEffect(() => {
    if (!kept) {
      return;
    }
    const pending = kept.filter(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kept]);

  const handleSwipeAgain = async (assetId: string) => {
    if (swipingAgainId) {
      return;
    }
    setSwipingAgainId(assetId);
    try {
      await KeptService.removeKept(assetId);
      setPreviewItem((current) => (current?.id === assetId ? null : current));
      refresh();
    } finally {
      setSwipingAgainId(null);
    }
  };

  const handleSwipeAgainAll = () => {
    if (!kept || kept.length === 0) {
      return;
    }
    Alert.alert(t('kept.swipeAgainAllTitle'), t('kept.swipeAgainAllBody', { count: kept.length }), [
      { text: t('trash.cancel'), style: 'cancel' },
      {
        text: t('kept.swipeAgainAll'),
        onPress: async () => {
          // Same non-blocking pattern as Trash's "Empty Trash Now".
          setSwipingAgainAll(true);
          try {
            const adShown = await showInterstitialAd();
            if (!adShown) {
              setAwaitingAd(true);
              await new Promise((resolve) => setTimeout(resolve, MIN_AD_WAIT_MS));
              setAwaitingAd(false);
            }
            await KeptService.clearAll();
            setPreviewItem(null);
            refresh();
          } finally {
            setSwipingAgainAll(false);
            setAwaitingAd(false);
          }
        },
      },
    ]);
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
              <View style={styles.spacer} />
              <Pressable
                style={[
                  styles.swipeAgainButton,
                  swipingAgainId === item.id && styles.swipeAgainButtonDisabled,
                ]}
                onPress={() => handleSwipeAgain(item.id)}
                disabled={swipingAgainId !== null}
              >
                {swipingAgainId === item.id ? (
                  <ActivityIndicator color={colors.onBrand} size="small" />
                ) : (
                  <Text style={styles.swipeAgainButtonText}>{t('kept.swipeAgain')}</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      <Text style={styles.adSupportNote}>{t('trash.adSupportNote')}</Text>
      <Pressable
        style={[styles.swipeAgainAllButton, swipingAgainAll && styles.swipeAgainAllButtonDisabled]}
        onPress={handleSwipeAgainAll}
        disabled={swipingAgainAll}
      >
        {swipingAgainAll ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <Text style={styles.swipeAgainAllButtonText}>{t('kept.swipeAgainAll')}</Text>
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
                  styles.previewSwipeAgainButton,
                  swipingAgainId === previewItem.id && styles.swipeAgainButtonDisabled,
                ]}
                onPress={() => handleSwipeAgain(previewItem.id)}
                disabled={swipingAgainId !== null}
              >
                {swipingAgainId === previewItem.id ? (
                  <ActivityIndicator color={colors.onBrand} size="small" />
                ) : (
                  <Text style={styles.swipeAgainButtonText}>{t('kept.swipeAgain')}</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </Modal>

      <AdUnavailableOverlay visible={awaitingAd} label={t('kept.adUnavailable')} />
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
    swipeAgainButtonDisabled: { opacity: 0.6 },
    adSupportNote: {
      color: colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 16,
      marginHorizontal: 24,
    },
    swipeAgainAllButton: {
      marginTop: 8,
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    swipeAgainAllButtonDisabled: { opacity: 0.6 },
    swipeAgainAllButtonText: { color: colors.onBrand, fontSize: 16, fontWeight: '600' },
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
