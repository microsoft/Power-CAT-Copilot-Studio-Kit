import { useQuery } from '@tanstack/react-query';
import { botService } from '../services/BotService';
import { queryKeys } from './queryKeys';

/**
 * Loads the current publication timestamp for one live bot.
 */
export function useBotPublication(
  botId: string | undefined,
  orgUrl?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.botPublication(orgUrl, botId ?? ''),
    queryFn: () => botService.getBotPublication(botId ?? '', orgUrl),
    enabled: Boolean(botId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
