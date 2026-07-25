import React, { createContext, useContext, useMemo, useState } from 'react';

interface BulkOperationContextValue {
  /** True for the whole "Empty Trash Now" window — from confirming the
   * in-app alert through the interstitial ad and every native "Allow
   * Swipix to delete N photos?" batch confirmation. Read by RootNavigator
   * to block switching tabs mid-flow: the bottom tab navigator keeps every
   * tab mounted, so without this a native delete dialog can surface on
   * whichever screen the user has since wandered to, looking completely
   * disconnected from the Trash action that actually triggered it
   * (confirmed: reported as a delete dialog appearing on the "By Month"
   * category, when the real cause was Trash's own bulk delete still
   * finishing in the background). */
  isBulkDeleteInProgress: boolean;
  setBulkDeleteInProgress: (value: boolean) => void;
}

const BulkOperationContext = createContext<BulkOperationContextValue | null>(null);

export function BulkOperationProvider({ children }: { children: React.ReactNode }) {
  const [isBulkDeleteInProgress, setBulkDeleteInProgress] = useState(false);
  const value = useMemo(
    () => ({ isBulkDeleteInProgress, setBulkDeleteInProgress }),
    [isBulkDeleteInProgress]
  );
  return <BulkOperationContext.Provider value={value}>{children}</BulkOperationContext.Provider>;
}

export function useBulkOperation(): BulkOperationContextValue {
  const context = useContext(BulkOperationContext);
  if (!context) {
    throw new Error('useBulkOperation must be used within a BulkOperationProvider');
  }
  return context;
}
