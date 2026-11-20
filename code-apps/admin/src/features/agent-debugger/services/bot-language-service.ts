import { MicrosoftDataverseService } from "../../../generated/services/MicrosoftDataverseService";
import type { FilterOption } from "../contracts/filters";
import {
  findCopilotLanguage,
  type CopilotLanguageDefinition,
} from "../utils/copilot-languages";
import { ensurePowerAppsInitialized } from "../utils/power-apps-init";
import { normalizeOrganizationUrl } from "./botcomponents-service";

function collectLanguageValues(value: unknown): Array<number | string> {
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  if (typeof value === "string") {
    return value
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const numeric = Number(part);
        return Number.isFinite(numeric) ? numeric : part;
      });
  }
  if (Array.isArray(value)) return value.flatMap(collectLanguageValues);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return collectLanguageValues(record.value ?? record.Value);
  }
  return [];
}

function toLanguageDefinition(value: number | string): CopilotLanguageDefinition | undefined {
  const language = findCopilotLanguage(value);
  if (language) return language;
  if (typeof value !== "number") return undefined;
  return { lcid: value, locale: String(value), label: `Language ${value}` };
}

function collectFormattedLabels(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function getBotLanguageOptions(
  botId: string,
  environmentUrl: string,
): Promise<FilterOption[]> {
  await ensurePowerAppsInitialized();

  const result = await MicrosoftDataverseService.GetItemWithOrganization(
    'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
    "application/json",
    normalizeOrganizationUrl(environmentUrl),
    "bots",
    botId,
    undefined,
    undefined,
    "language,supportedlanguages",
  );

  if (!result.success || !result.data) {
    throw new Error("Failed to load bot language settings.");
  }

  const primaryValues = collectLanguageValues(result.data["language"]);
  const supportedValues = collectLanguageValues(result.data["supportedlanguages"]);
  const primaryLabels = collectFormattedLabels(
    result.data["language@OData.Community.Display.V1.FormattedValue"],
  );
  const supportedLabels = collectFormattedLabels(
    result.data["supportedlanguages@OData.Community.Display.V1.FormattedValue"],
  );
  const options = new Map<string, FilterOption>();

  const configuredLanguages = [
    ...primaryValues.map((value, index) => ({ value, label: primaryLabels[index] })),
    ...supportedValues.map((value, index) => ({ value, label: supportedLabels[index] })),
  ];

  for (const { value, label } of configuredLanguages) {
    const language = toLanguageDefinition(value);
    if (language && !options.has(language.locale)) {
      options.set(language.locale, {
        value: language.locale,
        label: label ?? language.label,
      });
    }
  }

  return [...options.values()];
}
