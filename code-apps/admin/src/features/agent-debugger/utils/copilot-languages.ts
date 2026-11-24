export interface CopilotLanguageDefinition {
  lcid: number;
  locale: string;
  label: string;
}

export const COPILOT_LANGUAGES: readonly CopilotLanguageDefinition[] = [
  { lcid: 1033, locale: "en-US", label: "English" },
  { lcid: 1034, locale: "es-ES", label: "Spanish" },
  { lcid: 1046, locale: "pt-BR", label: "Portuguese (Brazilian)" },
  { lcid: 1036, locale: "fr-FR", label: "French" },
  { lcid: 1043, locale: "nl-NL", label: "Dutch" },
  { lcid: 1044, locale: "nb-NO", label: "Norwegian" },
  { lcid: 1030, locale: "da-DK", label: "Danish" },
  { lcid: 1053, locale: "sv-SE", label: "Swedish" },
  { lcid: 1040, locale: "it-IT", label: "Italian" },
  { lcid: 1031, locale: "de-DE", label: "German" },
  { lcid: 2052, locale: "zh-CN", label: "Chinese (Simplified)" },
  { lcid: 1028, locale: "zh-TW", label: "Chinese (Traditional)" },
  { lcid: 1025, locale: "ar-SA", label: "Arabic" },
  { lcid: 1026, locale: "bg-BG", label: "Bulgarian" },
  { lcid: 1041, locale: "ja-JP", label: "Japanese" },
  { lcid: 1042, locale: "ko-KR", label: "Korean" },
  { lcid: 1081, locale: "hi-IN", label: "Hindi" },
  { lcid: 1057, locale: "id-ID", label: "Indonesian" },
  { lcid: 1069, locale: "eu-ES", label: "Basque" },
  { lcid: 1049, locale: "ru-RU", label: "Russian" },
  { lcid: 1045, locale: "pl-PL", label: "Polish" },
  { lcid: 1055, locale: "tr-TR", label: "Turkish" },
  { lcid: 1054, locale: "th-TH", label: "Thai" },
  { lcid: 1035, locale: "fi-FI", label: "Finnish" },
  { lcid: 1032, locale: "el-GR", label: "Greek" },
  { lcid: 1029, locale: "cs-CZ", label: "Czech" },
  { lcid: 2057, locale: "en-GB", label: "English (United Kingdom)" },
  { lcid: 3084, locale: "fr-CA", label: "French (Canada)" },
  { lcid: 21514, locale: "es-US", label: "Spanish (United States)" },
  { lcid: 3081, locale: "en-AU", label: "English (Australia)" },
  { lcid: 1037, locale: "he-IL", label: "Hebrew" },
  { lcid: 2070, locale: "pt-PT", label: "Portuguese (Portugal)" },
];

const normalizeLanguageName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function findCopilotLanguage(value: number | string): CopilotLanguageDefinition | undefined {
  if (typeof value === "number") {
    return COPILOT_LANGUAGES.find((language) => language.lcid === value);
  }

  const normalized = normalizeLanguageName(value);
  return COPILOT_LANGUAGES.find(
    (language) =>
      normalizeLanguageName(language.label) === normalized ||
      normalizeLanguageName(language.locale) === normalized,
  );
}

export function getCopilotLanguageLabel(lcid: number): string {
  return findCopilotLanguage(lcid)?.label ?? `Language ${lcid}`;
}
