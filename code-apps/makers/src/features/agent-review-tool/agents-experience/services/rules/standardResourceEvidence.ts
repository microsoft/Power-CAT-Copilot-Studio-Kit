import type { PatternTopic, ResourceDetail } from '../../../contracts/StageOutputs';

/** Bind counted resources only to captured identities, never to another same-named component. */
export function standardResourceItems(resources: ResourceDetail[], legacyNames: string[], setting: string): PatternTopic[] {
  const remaining = new Map<string, number>();
  for (const resource of resources) remaining.set(resource.name, (remaining.get(resource.name) ?? 0) + 1);
  const unbound = legacyNames.filter(name => {
    const count = remaining.get(name) ?? 0;
    if (!count) return true;
    remaining.set(name, count - 1);
    return false;
  });
  const references: ResourceDetail[] = [...resources, ...unbound.map(name => ({ name }))];
  return references.map((resource): PatternTopic => {
    const identified = !!(resource.componentId?.trim() || resource.schemaName?.trim());
    return {
      item: resource.name, componentId: resource.componentId, schemaName: resource.schemaName,
      setting, current: resource.name,
      evidence: {
        source: 'configuration', status: identified ? 'verified' : 'unavailable', setting, quote: resource.name,
        reason: identified ? 'The resource is present in this snapshot. No runtime failure is asserted.'
          : 'Only a legacy resource name is available; component identity cannot be confirmed.',
      },
    };
  });
}
