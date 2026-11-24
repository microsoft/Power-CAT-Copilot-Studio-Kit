/**
 * The 10 known value-benefit categories with their chart palette colours.
 * Order matches the bar-chart slot assignment.
 */
export interface ValueBenefitCategory {
  name: string;
  color: string;
}

export const valueBenefitCategories: ValueBenefitCategory[] = [
  { name: 'Faster onboarding', color: '#637CEF' },
  { name: 'Higher customer satisfaction', color: '#E3008C' },
  { name: 'Improved accuracy', color: '#2AA0A4' },
  { name: 'Improved compliance', color: '#9373C0' },
  { name: 'Increased productivity', color: '#13A10E' },
  { name: 'Smarter recommendations', color: '#3A96DD' },
  { name: 'Better access to knowledge', color: '#CA5010' },
  { name: 'Time saved', color: '#57811B' },
  { name: 'Reduced operational costs', color: '#B146C2' },
  { name: 'Faster decisions', color: '#AE8C00' },
];

/** Quick lookup: benefit name -> hex colour. */
export const valueBenefitColorMap: Record<string, string> =
  Object.fromEntries(valueBenefitCategories.map((c) => [c.name, c.color]));
