import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Profile from './Profile';

const {
  apiClientMock,
  loadUserMock,
} = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  loadUserMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

vi.mock('../i18n', () => ({
  default: {
    changeLanguage: vi.fn(),
  },
  SUPPORTED_LOCALES: [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
  ],
}));

vi.mock('../api/client', () => ({
  default: apiClientMock,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      email: 'sso-profile@example.com',
      role: 'student',
      profile: {
        firstname: 'SSO',
        lastname: 'User',
        roles: ['student'],
      },
      isSSOUser: true,
      isSSOCreatedUser: true,
      allowEmailLogin: false,
      lastAuthProvider: 'sso',
    },
    loadUser: loadUserMock,
  }),
}));

vi.mock('../components/common/AutoSaveStatus', () => ({
  default: () => null,
}));

describe('Profile', () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
    apiClientMock.patch.mockReset();
    apiClientMock.post.mockReset();
    loadUserMock.mockReset();

    apiClientMock.get.mockResolvedValue({
      data: {
        user: {
          profile: {
            firstname: 'SSO',
            lastname: 'User',
            studentNumber: '12345',
          },
          locale: '',
        },
      },
    });
  });

  it('greys out SSO-managed name and password fields', async () => {
    render(<Profile />);

    await waitFor(() => {
      expect(apiClientMock.get).toHaveBeenCalledWith('/users/me');
    });

    expect(screen.getByLabelText('profile.firstName')).toBeDisabled();
    expect(screen.getByLabelText('profile.lastName')).toBeDisabled();
    expect(screen.getByLabelText('profile.currentPassword')).toBeDisabled();
    expect(screen.getByLabelText('profile.newPassword')).toBeDisabled();
    expect(screen.getByLabelText('profile.confirmNewPassword')).toBeDisabled();
    expect(screen.getByText('profile.ssoNameManagedNote')).toBeInTheDocument();
    expect(screen.getByText('profile.ssoPasswordManagedNote')).toBeInTheDocument();
    expect(screen.getByText('profile.ssoEmailLoginApprovalNote')).toBeInTheDocument();
  });
});
