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
    t: (key) => ({
      'profile.firstName': 'First Name',
      'profile.lastName': 'Last Name',
      'profile.language': 'Language',
      'profile.personalInfo': 'Personal Information',
      'profile.currentPassword': 'Current Password',
      'profile.newPassword': 'New Password',
      'profile.confirmNewPassword': 'Confirm New Password',
      'profile.ssoNameManagedNote': 'Your name is managed by your SSO provider and cannot be changed here.',
      'profile.ssoPasswordManagedNote': 'Password changes are unavailable while you are signed in through SSO.',
      'profile.ssoEmailLoginApprovalNote': 'This account was created through SSO. An administrator must approve email login before password reset or email-based sign-in can be used.',
    }[key] ?? key),
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

    expect(screen.getByLabelText('First Name')).toBeDisabled();
    expect(screen.getByLabelText('Last Name')).toBeDisabled();
    expect(screen.getByLabelText('Current Password')).toBeDisabled();
    expect(screen.getByLabelText('New Password')).toBeDisabled();
    expect(screen.getByLabelText('Confirm New Password')).toBeDisabled();
    expect(screen.getByText('Your name is managed by your SSO provider and cannot be changed here.')).toBeInTheDocument();
    expect(screen.getByText('Password changes are unavailable while you are signed in through SSO.')).toBeInTheDocument();
    expect(screen.getByText('This account was created through SSO. An administrator must approve email login before password reset or email-based sign-in can be used.')).toBeInTheDocument();
    const [languageHeading] = screen.getAllByText('Language', { selector: 'h6' });
    const personalInfoHeading = screen.getByText('Personal Information', { selector: 'h6' });
    expect(languageHeading.compareDocumentPosition(personalInfoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
