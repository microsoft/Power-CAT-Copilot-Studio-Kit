/**
 * Known declarative agent capabilities — display order per Figma 1880:19097.
 *
 * Each entry maps a JSON capability name to its display name and icon.
 * Used to render toggle rows in the edit template form.
 */

export interface KnownCapability {
  name: string;
  displayName: string;
  /** Fluent icon name for the connector icon (24-32px circle) */
  iconName: string;
}

export const KNOWN_CAPABILITIES: KnownCapability[] = [
  { name: 'CodeInterpreter', displayName: 'Code Interpreter', iconName: 'CodeBlock24Regular' },
  { name: 'WebSearch', displayName: 'WebSearch', iconName: 'Globe24Regular' },
  { name: 'TeamsMessages', displayName: 'TeamsMessages', iconName: 'PeopleTeam24Regular' },
  { name: 'Email', displayName: 'Email', iconName: 'Mail24Regular' },
  { name: 'Meetings', displayName: 'Meetings', iconName: 'CalendarLtr24Regular' },
  { name: 'OneDriveAndSharePoint', displayName: 'One Drive and SharePoint', iconName: 'CloudArrowUp24Regular' },
  { name: 'People', displayName: 'People', iconName: 'People24Regular' },
];
