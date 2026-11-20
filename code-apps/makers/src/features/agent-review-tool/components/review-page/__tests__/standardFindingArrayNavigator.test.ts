import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { StandardFindingArrayNavigator } from '../StandardFindingArrayNavigator';

describe('Standard finding item navigation', () => {
  it('uses a searchable item selector without a second Previous and Next pager', () => {
    const options = [
      { id: 'first', label: 'Ticket number', searchText: 'ticket number', value: {} },
      { id: 'second', label: 'Customer name', searchText: 'customer name', value: {} },
    ];
    const markup = renderToStaticMarkup(createElement(
      FluentProvider,
      { theme: webLightTheme },
      createElement(StandardFindingArrayNavigator, {
        options,
        selectedId: 'first',
        collectionLabel: 'Affected settings',
        itemLabel: 'affected setting',
        onSelect: () => undefined,
      }),
    ));

    expect(markup).toContain('Search or select affected settings');
    expect(markup).toContain('affected setting 1 of 2');
    expect(markup).not.toMatch(/>Previous<|>Next</);
  });
});
