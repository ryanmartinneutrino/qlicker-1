import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from './StudentDashboard';

const { apiClientMock, authState, fetchAllCoursesMock, tMock } = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
  },
  authState: {
    user: {
      profile: {
        roles: ['student'],
      },
      hasInstructorCourses: false,
    },
  },
  fetchAllCoursesMock: vi.fn(),
  tMock: vi.fn((key, options) => options?.defaultValue ?? key),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tMock }),
}));

vi.mock('../../api/client', () => ({
  default: apiClientMock,
  getAccessToken: vi.fn(() => null),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../../utils/fetchAllCourses', () => ({
  fetchAllCourses: fetchAllCoursesMock,
}));

describe('StudentDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      profile: {
        roles: ['student'],
      },
      hasInstructorCourses: false,
    };
    apiClientMock.get.mockImplementation((url) => {
      if (url === '/sessions/live') {
        return Promise.resolve({ data: { liveSessions: [] } });
      }
      if (url === '/health') {
        return Promise.resolve({ data: { websocket: false } });
      }
      return Promise.resolve({ data: {} });
    });
    fetchAllCoursesMock.mockResolvedValue([
      {
        _id: 'course-1',
        name: 'Course One',
        semester: 'Fall 2026',
      },
    ]);
  });

  function renderDashboard() {
    return render(
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>
    );
  }

  it('does not fetch instructor courses for student-only users', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(fetchAllCoursesMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchAllCoursesMock).toHaveBeenCalledWith(apiClientMock, { view: 'student' });
    expect(fetchAllCoursesMock).not.toHaveBeenCalledWith(apiClientMock, { view: 'instructor' });
  });

  it('fetches instructor courses when the user has instructor-course access', async () => {
    authState.user = {
      profile: {
        roles: ['student'],
      },
      hasInstructorCourses: true,
    };
    fetchAllCoursesMock
      .mockResolvedValueOnce([
        {
          _id: 'course-1',
          name: 'Course One',
          semester: 'Fall 2026',
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: 'course-2',
          name: 'TA Course',
          semester: 'Fall 2026',
        },
      ]);

    renderDashboard();

    await waitFor(() => {
      expect(fetchAllCoursesMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchAllCoursesMock).toHaveBeenNthCalledWith(1, apiClientMock, { view: 'student' });
    expect(fetchAllCoursesMock).toHaveBeenNthCalledWith(2, apiClientMock, { view: 'instructor' });
  });
});
