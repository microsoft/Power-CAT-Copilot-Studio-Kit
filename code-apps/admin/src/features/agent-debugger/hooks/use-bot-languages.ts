import { useQuery } from "@tanstack/react-query";
import { getBotLanguageOptions } from "../services/bot-language-service";

const BOT_LANGUAGE_STALE_TIME_MS = 1000 * 60 * 5;

export function useBotLanguageOptions(
  botId: string | undefined,
  environmentUrl: string | undefined,
) {
  return useQuery({
    queryKey: ["botLanguageOptions", environmentUrl, botId],
    queryFn: () => getBotLanguageOptions(botId!, environmentUrl!),
    enabled: Boolean(botId && environmentUrl),
    staleTime: BOT_LANGUAGE_STALE_TIME_MS,
  });
}
