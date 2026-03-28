import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../../i18n';
import UserManual from './UserManual';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: {
      profile: {
        firstname: 'Student',
        lastname: 'User',
        roles: ['student'],
      },
    },
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

function renderManual(initialEntry) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/manual" element={<UserManual />} />
          <Route path="/manual/:role" element={<UserManual />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('UserManual', () => {
  beforeEach(() => {
    authState.user = {
      profile: {
        firstname: 'Student',
        lastname: 'User',
        roles: ['student'],
      },
    };
  });

  it('shows an access warning when a student opens the admin manual', async () => {
    renderManual('/manual/admin');

    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/do not have access to the Admin manual/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/student');
    expect(screen.getByRole('link', { name: /open profile/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: /open student manual/i })).toHaveAttribute('href', '/manual/student');
  });

  it('renders the student manual content and screenshots for student users', async () => {
    renderManual('/manual/student');

    expect(await screen.findByRole('heading', { name: /student user manual/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/student');
    expect(screen.getAllByText(/usual app bar stays available while you read/i)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: /enroll in a course and learn the course tabs/i })).toBeInTheDocument();
    expect(screen.getByText(/you usually only need the join code once per course/i)).toBeInTheDocument();
    expect(screen.getByText(/student course page preview/i)).toBeInTheDocument();
    expect(screen.getByText(/review and practice preview/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /student course page preview/i })).toHaveAttribute('src', '/manuals/student-course.png');
    expect(screen.getByRole('img', { name: /review and practice preview/i })).toHaveAttribute('src', '/manuals/student-review.png');
    expect(screen.getAllByRole('link').find((link) => link.getAttribute('href') === '#manual-section-1')).toBeTruthy();
    expect(screen.getByRole('link', { name: /↑ navigation/i })).toHaveAttribute('href', '#manual-top');
  });

  it('renders the professor manual for professor users and keeps the student manual available', async () => {
    authState.user = {
      profile: {
        firstname: 'Prof',
        lastname: 'User',
        roles: ['professor'],
      },
    };

    renderManual('/manual/professor');

    expect(await screen.findByRole('heading', { name: /professor user manual/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/prof');
    expect(screen.getByRole('link', { name: /student/i })).toHaveAttribute('href', '/manual/student');
    const courseHeading = screen.getByRole('heading', { name: /create a course and add topics before you scale up/i });
    const groupsHeading = screen.getByRole('heading', { name: /set up groups before you need them in class/i });
    const sessionsHeading = screen.getByRole('heading', { name: /build sessions with questions, slides, and visibility in mind/i });
    expect(courseHeading.compareDocumentPosition(groupsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(groupsHeading.compareDocumentPosition(sessionsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/students enter from their dashboard to join that specific course/i)).toBeInTheDocument();
    expect(screen.getByText(/each student can belong to only one group inside a category/i)).toBeInTheDocument();
    expect(screen.getByText(/session editor preview/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /professor course workspace preview/i })).toHaveAttribute('src', '/manuals/professor-course.png');
    expect(screen.getByRole('img', { name: /session editor preview/i })).toHaveAttribute('src', '/manuals/session-editor.png');
  });

  it('renders the admin manual with a real storage screenshot', async () => {
    authState.user = {
      profile: {
        firstname: 'Admin',
        lastname: 'User',
        roles: ['admin'],
      },
    };

    renderManual('/manual/admin');

    expect(await screen.findByRole('heading', { name: /admin user manual/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('img', { name: /admin dashboard overview/i })).toHaveAttribute('src', '/manuals/admin-dashboard.png');
    expect(screen.getByRole('img', { name: /storage configuration preview/i })).toHaveAttribute('src', '/manuals/admin-storage.png');
    expect(screen.getAllByRole('link').find((link) => link.getAttribute('href') === '#manual-section-2')).toBeTruthy();
  });
});
