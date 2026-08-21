/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Toolbar } from '../src/components/Toolbar';

test('renders accessible product controls', async () => {
  let application!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    application = ReactTestRenderer.create(
      <Toolbar
        compact
        runtimeReady
        onNew={jest.fn()}
        onImport={jest.fn()}
        onExport={jest.fn()}
        onShare={jest.fn()}
        onInterrupt={jest.fn()}
        onSettings={jest.fn()}
        onToggleDocuments={jest.fn()}
      />,
    );
  });
  expect(
    application.root.findByProps({
      accessibilityLabel: 'Interrupt Sage.js computation',
    }),
  ).toBeTruthy();
});
