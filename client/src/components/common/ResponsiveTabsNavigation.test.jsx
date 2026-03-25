import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResponsiveTabsNavigation from './ResponsiveTabsNavigation';
import i18n from '../../i18n';

function mockMatchMedia(matches) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ResponsiveTabsNavigation', () => {
  beforeEach(() => {
    i18n.changeLanguage('en');
  });

  it('renders standard tabs on wider screens', () => {
    mockMatchMedia(false);
    const onChange = vi.fn();

    render(
      <ResponsiveTabsNavigation
        value={0}
        onChange={onChange}
        ariaLabel="Demo tabs"
        tabs={[
          { value: 0, label: 'Overview' },
          { value: 1, label: 'Users' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('renders a select dropdown on narrow screens', () => {
    mockMatchMedia(true);
    const onChange = vi.fn();

    render(
      <ResponsiveTabsNavigation
        value={0}
        onChange={onChange}
        dropdownLabel="View"
        tabs={[
          { value: 0, label: 'Overview' },
          { value: 1, label: 'Users' },
        ]}
      />
    );

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Users' }));

    expect(onChange).toHaveBeenCalledWith(1);
  });
});
