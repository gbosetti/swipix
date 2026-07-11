import React, { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TrashService } from '../services/TrashService';
import { TrashedAsset } from '../types';
import { Colors } from '../theme/colors';

/**
 * Lets the user see exactly what's staged for deletion and restore
 * individual photos — without this, "pending deletion" is just a number
 * with no way back, which defeats the point of a grace period.
 */
export default function TrashScreen() {
  const [trash, setTrash] = useState<TrashedAsset[] | null>(null);
  const [previewItem, setPreviewItem] = useState<TrashedAsset | null>(null);

  const refresh = useCallback(() => {
    TrashService.getTrash().then(setTrash);
  }, []);

  useFocusEffect(refresh);

  const handleRestore = async (assetId: string) => {
    await TrashService.restore(assetId);
    setPreviewItem((current) => (current?.id === assetId ? null : current));
    refresh();
  };

  const handleEmptyAll = () => {
    if (!trash || trash.length === 0) return;
    Alert.alert(
      'Empty Trash?',
      `This permanently deletes ${trash.length} photo${trash.length === 1 ? '' : 's'}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await TrashService.permanentlyDelete(trash.map((item) => item.id));
            } catch {
              // User cancelled the native confirmation, or deletion failed —
              // trash bookkeeping is left untouched, nothing to do here.
            }
            refresh();
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
        <Text style={styles.emptyText}>Trash is empty 🎉</Text>
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
          // Guards against records saved before localUri resolution was
          // added — ph:// isn't renderable by <Image> and would otherwise
          // crash the native image loader.
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
              <Text style={styles.rowText}>Pending deletion</Text>
              <Pressable style={styles.restoreButton} onPress={() => handleRestore(item.id)}>
                <Text style={styles.restoreButtonText}>Restore</Text>
              </Pressable>
            </View>
          );
        }}
      />
      <Pressable style={styles.emptyButton} onPress={handleEmptyAll}>
        <Text style={styles.emptyButtonText}>Empty Trash Now</Text>
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
              <Image
                source={{ uri: previewItem.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
              <Pressable
                style={styles.previewRestoreButton}
                onPress={() => handleRestore(previewItem.id)}
              >
                <Text style={styles.restoreButtonText}>Restore</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  emptyText: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 10,
  },
  thumbnail: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.placeholder },
  thumbnailPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: Colors.textSecondary, fontSize: 20, fontWeight: '700' },
  rowText: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  restoreButton: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  restoreButtonText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  emptyButton: {
    margin: 16,
    backgroundColor: Colors.danger,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  emptyButtonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
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
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  previewCloseButtonText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  previewRestoreButton: {
    marginTop: 20,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
