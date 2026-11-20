import { useCallback } from 'react';
import { useToastController, Toast, ToastTitle } from '@fluentui/react-components';

export const POWERSHIELD_TOASTER_ID = 'powershield-global';

/**
 * Thin wrapper around Fluent UI v9 useToastController.
 * Provides notifySuccess / notifyError helpers tied to the global Toaster.
 *
 * Requires <Toaster toasterId={POWERSHIELD_TOASTER_ID} /> to be mounted
 * in the component tree (AppShell).
 */
export function useNotify() {
  const { dispatchToast } = useToastController(POWERSHIELD_TOASTER_ID);

  const notifySuccess = useCallback(
    (message: string) =>
      dispatchToast(
        <Toast>
          <ToastTitle>{message}</ToastTitle>
        </Toast>,
        { intent: 'success', timeout: 4000 },
      ),
    [dispatchToast],
  );

  const notifyError = useCallback(
    (message: string) =>
      dispatchToast(
        <Toast>
          <ToastTitle>{message}</ToastTitle>
        </Toast>,
        { intent: 'error', timeout: 6000 },
      ),
    [dispatchToast],
  );

  const notifyWarning = useCallback(
    (message: string) =>
      dispatchToast(
        <Toast>
          <ToastTitle>{message}</ToastTitle>
        </Toast>,
        { intent: 'warning', timeout: 6000 },
      ),
    [dispatchToast],
  );

  return { notifySuccess, notifyError, notifyWarning };
}
