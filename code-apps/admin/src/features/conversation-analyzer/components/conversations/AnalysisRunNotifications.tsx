import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Link, Toast, ToastBody, ToastFooter, ToastTitle, ToastTrigger, Toaster,
  useId, useToastController,
} from '@fluentui/react-components';
import { useConversationAnalysis } from '../../hooks/useConversationAnalysis';
import { claimAnalysisRunNotification } from '../../utils/analysisRunNotification';

/** Feature-level result notifications stay mounted while analyzer screens and tabs change. */
export function AnalysisRunNotifications() {
  const toasterId = useId('analysis-run-toaster');
  const { dispatchToast } = useToastController(toasterId);
  const client = useQueryClient();
  const navigate = useNavigate();
  const { run } = useConversationAnalysis();

  useEffect(() => {
    const notification = claimAnalysisRunNotification(client);
    if (!notification) return;
    const { intent, title, body, resultsPath } = notification;
    dispatchToast(
      <Toast>
        <ToastTitle action={<ToastTrigger><Link>Dismiss</Link></ToastTrigger>}>{title}</ToastTitle>
        <ToastBody>{body}</ToastBody>
        {resultsPath && (
          <ToastFooter>
            <ToastTrigger><Link onClick={() => navigate(resultsPath)}>View results</Link></ToastTrigger>
          </ToastFooter>
        )}
      </Toast>,
      { intent },
    );
  }, [run, client, dispatchToast, navigate]);

  return <Toaster toasterId={toasterId} position="top-end" pauseOnHover />;
}
