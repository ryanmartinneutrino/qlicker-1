import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import AdminDashboard from './AdminDashboard';

const { apiClientMock, authState } = vi.hoisted(() => ({
  apiClientMock: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  authState: {
    user: {
      _id: 'admin-1',
      profile: {
        firstname: 'Admin',
        lastname: 'User',
        roles: ['admin'],
      },
    },
  },
}));

vi.mock('../../api/client', () => ({
  default: apiClientMock,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../components/common/AutoSaveStatus', () => ({
  default: () => null,
}));

let settingsState;
let usersState;
let userDetailsState;

function buildUser(overrides = {}) {
  const user = {
    _id: 'student-1',
    emails: [{ address: 'student@example.com', verified: true }],
    profile: {
      firstname: 'Student',
      lastname: 'User',
      roles: ['student'],
      canPromote: false,
    },
    allowEmailLogin: true,
    disabled: false,
    activeSessions: [],
    studentCourses: [],
    instructorCourses: [],
    ...overrides,
  };

  return {
    ...user,
    profile: {
      firstname: 'Student',
      lastname: 'User',
      roles: ['student'],
      canPromote: false,
      ...(overrides.profile || {}),
    },
  };
}

function renderDashboard() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiClientMock.delete.mockReset();
    apiClientMock.get.mockReset();
    apiClientMock.patch.mockReset();
    apiClientMock.post.mockReset();

    settingsState = {
      restrictDomain: false,
      allowedDomains: [],
      requireVerified: false,
      adminEmail: 'admin@example.com',
      tokenExpiryMinutes: 120,
      locale: 'en',
      dateFormat: 'DD-MMM-YYYY',
      timeFormat: '24h',
      SSO_enabled: true,
      backupEnabled: false,
      backupTimeLocal: '02:00',
      backupRetentionDaily: 7,
      backupRetentionWeekly: 4,
      backupRetentionMonthly: 12,
      backupLastRunAt: '2026-03-27T07:15:00.000Z',
      backupLastRunType: 'weekly',
      backupLastRunStatus: 'success',
      backupLastRunFilename: 'qlicker_backup_20260327_071500_weekly.tar.gz',
      backupLastRunMessage: 'Backup completed successfully.',
    };

    usersState = [buildUser()];
    userDetailsState = new Map(usersState.map((user) => [user._id, { ...user }]));

    apiClientMock.get.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({ data: settingsState });
      }

      if (url === '/users') {
        return Promise.resolve({
          data: {
            users: usersState,
            total: usersState.length,
          },
        });
      }

      if (url.startsWith('/users/')) {
        const userId = url.split('/').at(-1);
        return Promise.resolve({ data: userDetailsState.get(userId) });
      }

      throw new Error(`Unexpected GET ${url}`);
    });

    apiClientMock.patch.mockImplementation((url, payload) => {
      if (url === '/settings') {
        settingsState = {
          ...settingsState,
          ...payload,
        };
        return Promise.resolve({ data: settingsState });
      }

      if (url === '/users/student-1/properties') {
        const nextUser = {
          ...userDetailsState.get('student-1'),
          ...payload,
          profile: {
            ...userDetailsState.get('student-1').profile,
            canPromote: payload.canPromote ?? userDetailsState.get('student-1').profile.canPromote,
          },
        };
        userDetailsState.set('student-1', nextUser);
        usersState = usersState.map((user) => (user._id === nextUser._id ? nextUser : user));
        return Promise.resolve({ data: nextUser });
      }

      throw new Error(`Unexpected PATCH ${url}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-saves backup settings and reloads normalized retention values from the Backup tab', async () => {
    const { unmount } = renderDashboard();

    fireEvent.click(await screen.findByRole('tab', { name: /^Backup$/i }));

    expect(await screen.findByLabelText(/Enable scheduled backups/i)).not.toBeChecked();
    expect(screen.getByText(/qlicker_backup_20260327_071500_weekly\.tar\.gz/i)).toBeInTheDocument();
    expect(screen.getByText(/Backup completed successfully\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Enable scheduled backups/i }));
    fireEvent.change(screen.getByLabelText(/Backup time \(local\)/i), { target: { value: '03:30' } });
    fireEvent.change(screen.getByLabelText(/Daily backups to keep/i), { target: { value: '-2' } });
    fireEvent.change(screen.getByLabelText(/Weekly backups to keep/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Monthly backups to keep/i), { target: { value: '9' } });

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(apiClientMock.patch).toHaveBeenCalledWith('/settings', {
        backupEnabled: true,
        backupTimeLocal: '03:30',
        backupRetentionDaily: 7,
        backupRetentionWeekly: 5,
        backupRetentionMonthly: 9,
      });
    });

    unmount();
    renderDashboard();

    fireEvent.click(await screen.findByRole('tab', { name: /^Backup$/i }));
    expect(await screen.findByRole('checkbox', { name: /Enable scheduled backups/i })).toBeChecked();
    expect(screen.getByLabelText(/Backup time \(local\)/i)).toHaveValue('03:30');
    expect(screen.getByLabelText(/Daily backups to keep/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Weekly backups to keep/i)).toHaveValue(5);
    expect(screen.getByLabelText(/Monthly backups to keep/i)).toHaveValue(9);
  });

  it('disables and restores a user account from the Users tab', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole('tab', { name: /^Users$/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Search by name or email/i), {
      target: { value: 'student@example.com' },
    });

    const getUserRow = () => screen.getByText('student@example.com').closest('tr');
    const userRow = await waitFor(() => {
      const row = getUserRow();
      expect(row).not.toBeNull();
      return row;
    });

    fireEvent.click(within(userRow).getByRole('button', { name: /^Disable user$/i }));

    await waitFor(() => {
      expect(apiClientMock.patch).toHaveBeenCalledWith('/users/student-1/properties', {
        disabled: true,
      });
    });
    expect(within(getUserRow()).getByText(/^Disabled$/i)).toBeInTheDocument();

    fireEvent.click(within(getUserRow()).getByRole('button', { name: /^Restore user$/i }));

    await waitFor(() => {
      expect(apiClientMock.patch).toHaveBeenCalledWith('/users/student-1/properties', {
        disabled: false,
      });
    });
    expect(within(getUserRow()).queryByText(/^Disabled$/i)).not.toBeInTheDocument();
  });
});
