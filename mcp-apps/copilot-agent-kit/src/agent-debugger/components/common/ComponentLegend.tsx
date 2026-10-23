import { tokens } from '@fluentui/react-components';
import { componentColor } from '../../theme/component-colors';

export interface ComponentLegendProps {
  /** Component/step types present in the current view. */
  types: string[];
  /** Adds the hatched "Idle" swatch. */
  showIdle?: boolean;
  /** Adds the red "Slowest" marker. */
  showSlowest?: boolean;
}

/**
 * Right-aligned colour key for the component types shown in a chart.
 * Emits the design's own `.w-legend` / `.w-dot` markup verbatim — the
 * `styles/design/workspace.css` stylesheet (loaded globally) supplies all
 * visual styling, so no Griffel rules are defined for these elements.
 */
export function ComponentLegend({ types, showIdle, showSlowest }: ComponentLegendProps) {
  if (!types.length && !showIdle && !showSlowest) return null;

  return (
    <div className="w-legend" aria-label="Component colour key">
      {types.map((type) => (
        <span key={type}>
          <i
            aria-hidden="true"
            className="w-dot"
            style={{ backgroundColor: componentColor(type) }}
          />
          {type}
        </span>
      ))}
      {showIdle && (
        <span>
          <i className="w-dot" style={{ backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, ${tokens.colorNeutralStroke1} 3px, ${tokens.colorNeutralStroke1} 4px)` }} />
          Idle
        </span>
      )}
      {showSlowest && (
        <span>
          <i className="w-dot slowest" />
          Slowest
        </span>
      )}
    </div>
  );
}
