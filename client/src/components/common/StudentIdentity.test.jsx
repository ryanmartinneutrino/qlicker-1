import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudentIdentity from './StudentIdentity';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => ({
      'common.close': 'Close',
      'common.unknown': 'Unknown',
    }[key] ?? key),
  }),
}));

describe('StudentIdentity', () => {
  it('opens the full-size profile image dialog from the avatar keyboard control', () => {
    render(
      <StudentIdentity
        student={{
          emails: [{ address: 'ada@example.com' }],
          profile: {
            firstname: 'Ada',
            lastname: 'Lovelace',
            profileThumbnail: '/uploads/ada-thumb.jpg',
            profileImage: '/uploads/ada-full.jpg',
          },
        }}
      />
    );

    const avatarButton = screen.getByRole('button', { name: 'Ada Lovelace' });
    fireEvent.keyDown(avatarButton, { key: 'Enter' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveAttribute('src', '/uploads/ada-full.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    return waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('falls back to an unknown label when the student record has no display fields', () => {
    render(<StudentIdentity student={{}} showEmail={false} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
