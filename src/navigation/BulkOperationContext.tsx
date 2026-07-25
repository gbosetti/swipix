import React, { createContext, useContext, useMemo, useState } from 'react';

interface BulkOperationContextValue {
  /** True for the whole "Empty Trash Now" window. Read by RootNavigator
   * to block switching tabs mid-flow — every tab stays mounted, so
   * without this a native delete dialog can surface on an unrelated
   * screen the user has since wandered to. */
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
