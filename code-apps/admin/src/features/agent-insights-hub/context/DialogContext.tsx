/* eslint-disable react-refresh/only-export-components */
/**
 * DialogContext - Isolated dialog state management.
 *
 * Separated from FilterContext (per M-6) to prevent chart re-renders
 * when dialogs open or close. Uses simple useState since dialog state
 * is a single value with no complex transitions.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DialogId =
  | "addAgent"
  | "showAgents"
  | "generateMetrics"
  | "feedback";

export interface DialogContextType {
  activeDialog: DialogId | null;
  dialogData?: unknown;
  openDialog: (id: DialogId, data?: unknown) => void;
  closeDialog: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DialogContext = createContext<DialogContextType | undefined>(undefined);

interface DialogProviderProps {
  children: React.ReactNode;
}

/** Provides dialog open/close state isolated from filter state. */
export function DialogProvider({ children }: DialogProviderProps) {
  const [activeDialog, setActiveDialog] = useState<DialogId | null>(null);
  const [dialogData, setDialogData] = useState<unknown>(undefined);

  const openDialog = useCallback((id: DialogId, data?: unknown) => {
    setActiveDialog(id);
    setDialogData(data);
  }, []);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setDialogData(undefined);
  }, []);

  const value = useMemo<DialogContextType>(
    () => ({ activeDialog, dialogData, openDialog, closeDialog }),
    [activeDialog, dialogData, openDialog, closeDialog]
  );

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

/** Hook to consume dialog context. Throws if used outside provider. */
export function useDialogContext(): DialogContextType {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialogContext must be used within a DialogProvider");
  }
  return ctx;
}
