import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../../i18n';
import AppLayout from './AppLayout';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: {
      profile: {
        firstname: 'Prof',
        lastname: 'User',
        roles: ['professor'],
      },
    },
    logout: vi.fn(),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../common/ConnectionStatus', () => ({
  default: () => null,
}));

function renderLayout(initialEntry = '/manage') {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/manage" element={<div>Dashboard destination</div>} />
            <Route path="/admin" element={<div>Admin destination</div>} />
            <Route path="/manual/professor" element={<div>Professor manual destination</div>} />
            <Route path="/manual/admin" element={<div>Admin manual destination</div>} />
            <Route path="/profile" element={<div>Profile destination</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    authState.logout.mockReset();
    authState.user = {
      profile: {
        firstname: 'Prof',
        lastname: 'User',
        roles: ['professor'],
      },
    };
  });

  it('opens the account menu and routes professors to the professor manual', async () => {
    renderLayout('/manage');

    fireEvent.click(screen.getByRole('button', { name: /open account menu/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /user manual/i }));

    await waitFor(() => {
      expect(screen.getByText('Professor manual destination')).toBeInTheDocument();
    });
  });

  it('routes admins to the admin manual from the account menu', async () => {
    authState.user = {
      profile: {
        firstname: 'Admin',
        lastname: 'User',
        roles: ['admin'],
      },
    };
    renderLayout('/admin');

    fireEvent.click(screen.getByRole('button', { name: /open account menu/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /user manual/i }));

    await waitFor(() => {
      expect(screen.getByText('Admin manual destination')).toBeInTheDocument();
    });
  });
});
