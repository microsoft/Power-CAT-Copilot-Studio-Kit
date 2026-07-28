import React, { useState, useEffect, useCallback } from 'react';
import { MessageBar, MessageBarBody, MessageBarActions, Button } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

type ToastType = 'success' | 'error' | 'info';

interface ToastMsg {
  message: string;
  type: ToastType;
  key: number;
  // 0 = persistent (no auto-dismiss; user must click ✕). Default 3000ms.
  durationMs?: number;
}

let showToastGlobal: (msg: string, type?: ToastType, durationMs?: number) => void = () => {};

export function useToast() {
  return useCallback((msg: string, type: ToastType = 'success', durationMs?: number) => {
    showToastGlobal(msg, type, durationMs);
  }, []);
}

export function ToastContainer() {
  const [queue, setQueue] = useState<ToastMsg[]>([]);
  const visible = queue[0] ?? null;

  useEffect(() => {
    showToastGlobal = (msg, type = 'success', durationMs) => {
      // A new toast event replaces any current persistent toast.
      // Auto-dismiss toasts continue to queue normally behind it.
      // This way a stale FK alert ("Did you mean...") clears as soon as the
      // user retries (success or different alert), without needing the ✕ click.
      setQueue(q => {
        const stripped = q.filter(t => t.durationMs !== 0);
        return [...stripped, { message: msg, type, key: Date.now(), durationMs }];
      });
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    // durationMs === 0 means persistent — user dismisses via the ✕ button.
    if (visible.durationMs === 0) return;
    const t = setTimeout(() => setQueue(q => q.slice(1)), visible.durationMs ?? 3000);
    return () => clearTimeout(t);
  }, [visible]);

  const dismiss = () => setQueue(q => q.slice(1));

  if (!visible) return null;

  const intent = visible.type === 'error' ? 'error' : visible.type === 'info' ? 'info' : 'success';
  const isPersistent = visible.durationMs === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 999,
      }}
    >
      <MessageBar intent={intent}>
        <MessageBarBody>{visible.message}</MessageBarBody>
        {isPersistent && (
          <MessageBarActions
            containerAction={
              <Button
                aria-label="Dismiss"
                appearance="transparent"
                icon={<DismissRegular />}
                onClick={dismiss}
              />
            }
          />
        )}
      </MessageBar>
    </div>
  );
}
