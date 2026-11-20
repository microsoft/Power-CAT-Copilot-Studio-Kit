import { useQuery } from '@tanstack/react-query';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { PowerAppsforMakersService } from '../../../generated/services/PowerAppsforMakersService';

/** Environment option used by the Agent Review Tool selector. */
export interface ReviewOrganizationOption {
  Url?: string;
  FriendlyName?: string;
  EnvironmentId?: string;
}

interface PowerPlatformEnvironmentResponse {
  value?: Array<{
    name?: string;
    properties?: {
      linkedEnvironmentMetadata?: {
        instanceUrl?: string;
      };
    };
  }>;
}

function canonicalOrganizationUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\/+$/, '');
  return normalized || null;
}

/**
 * Fetches all Dataverse organizations (environments) available to the current user.
 * Used to populate the environment selector in the ActionToolbar.
 */
export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const [organizationResult, environmentResult] = await Promise.all([
        MicrosoftDataverseService.GetOrganizations(),
        PowerAppsforMakersService.Get_Environments('2022-11-01', 250),
      ]);
      const environments =
        (environmentResult.data as PowerPlatformEnvironmentResponse | undefined)?.value ?? [];
      const environmentIdByUrl = new Map<string, string>();

      for (const environment of environments) {
        const url = canonicalOrganizationUrl(
          environment.properties?.linkedEnvironmentMetadata?.instanceUrl,
        );
        if (url && environment.name) {
          environmentIdByUrl.set(url, environment.name);
        }
      }

      return (organizationResult.data?.value ?? []).map<ReviewOrganizationOption>((organization) => {
        const url = canonicalOrganizationUrl(organization.Url);
        const environmentId = url ? environmentIdByUrl.get(url) : undefined;
        return environmentId
          ? { ...organization, EnvironmentId: environmentId }
          : organization;
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
