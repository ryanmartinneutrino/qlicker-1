/**
 * live-session.js – k6 load-test scenario for an interactive Qlicker session.
 *
 * Simulates a professor running a 5-question live session with 250-500 students.
 * Each virtual user (VU) represents a student who:
 *   1. Logs in  →  obtains a JWT
 *   2. Opens a WebSocket connection for real-time events
 *   3. Joins the session
 *   4. Waits for each question to be shown (via WebSocket)
 *   5. Submits an answer
 *   6. Observes stats / correct-answer broadcasts
 *
 * A separate "professor" scenario (1 VU) drives the session:
 *   1. Logs in
 *   2. Starts the session
 *   3. For each question: show → open attempt → wait → close attempt →
 *      show stats → wait → show correct → wait → navigate to next question
 *   4. Ends the session
 *
 * ──────────────────────────────────────────────────────────────────
 * Prerequisites:
 *   1. Run `node seed.mjs` to populate the database.
 *   2. Ensure the Qlicker server is running and reachable.
 *
 * Usage:
 *   k6 run --env BASE_URL=http://localhost:3001 scenarios/live-session.js
 *
 * Tunables (via -e / --env):
 *   BASE_URL           Server base URL             (default: http://localhost:3001)
 *   STATE_FILE         Path to state.json          (default: ../state.json relative to CWD)
 *   ANSWER_WINDOW_S    Seconds students have to answer (default: 30)
 *   STATS_PAUSE_S      Pause after showing stats   (default: 15)
 *   CORRECT_PAUSE_S    Pause after showing correct  (default: 15)
 * ──────────────────────────────────────────────────────────────────
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

/* ── Configuration ──────────────────────────────────────────────── */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';

const STATE_FILE = __ENV.STATE_FILE || '../state.json';
const ANSWER_WINDOW_S = parseInt(__ENV.ANSWER_WINDOW_S || '30', 10);
const STATS_PAUSE_S = parseInt(__ENV.STATS_PAUSE_S || '15', 10);
const CORRECT_PAUSE_S = parseInt(__ENV.CORRECT_PAUSE_S || '15', 10);

// Load seed state (shared across VUs – read once)
const state = JSON.parse(open(STATE_FILE));

// Pre-load student array for VU assignment
const students = new SharedArray('students', () => state.students);

/* ── Custom metrics ─────────────────────────────────────────────── */

const loginDuration = new Trend('login_duration', true);
const joinDuration = new Trend('join_duration', true);
const respondDuration = new Trend('respond_duration', true);
const wsEventLatency = new Trend('ws_event_latency', true);
const wsConnections = new Counter('ws_connections');
const wsErrors = new Counter('ws_errors');
const loginSuccess = new Rate('login_success');
const joinSuccess = new Rate('join_success');
const respondSuccess = new Rate('respond_success');

/* ── k6 options ─────────────────────────────────────────────────── */

export const options = {
  scenarios: {
    professor: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'professorFlow',
      maxDuration: '20m',
    },
    students: {
      executor: 'per-vu-iterations',
      vus: students.length,
      iterations: 1,
      exec: 'studentFlow',
      maxDuration: '20m',
      startTime: '3s', // give the professor a head-start
    },
  },
  thresholds: {
    login_success: ['rate>0.95'],
    join_success: ['rate>0.95'],
    respond_success: ['rate>0.90'],
    login_duration: ['p(95)<5000'],
    join_duration: ['p(95)<3000'],
    respond_duration: ['p(95)<3000'],
    ws_event_latency: ['p(95)<5000'],
  },
};

/* ── Helpers ─────────────────────────────────────────────────────── */

function apiHeaders(token) {
  const h = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function login(email, password) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: apiHeaders(), tags: { name: 'login' } },
  );
  return res;
}

function generateAnswer(question) {
  switch (question.label) {
    case 'MC':
    case 'TF':
      // Pick a random option index
      return String(Math.floor(Math.random() * question.optionCount));
    case 'MS':
      // Pick 1-3 random options as comma-separated indices
      {
        const picks = new Set();
        const count = Math.floor(Math.random() * 3) + 1;
        while (picks.size < count && picks.size < question.optionCount) {
          picks.add(Math.floor(Math.random() * question.optionCount));
        }
        return JSON.stringify([...picks].sort());
      }
    case 'SA':
      return 'Au';
    case 'NU':
      // Answer near the correct value ± some noise
      return String((3.14 + (Math.random() - 0.5) * 0.1).toFixed(2));
    default:
      return '0';
  }
}

/* ── Professor flow ─────────────────────────────────────────────── */

export function professorFlow() {
  const sessionId = state.session.id;
  const questions = state.questions;
  let profToken;

  group('professor_login', () => {
    const res = login(state.professor.email, state.password);
    check(res, { 'prof login 200': (r) => r.status === 200 });
    const body = res.json();
    profToken = body.token;
  });

  if (!profToken) {
    console.error('Professor login failed – aborting');
    return;
  }

  // Start the session
  group('start_session', () => {
    const res = http.post(
      `${API}/sessions/${sessionId}/start`,
      null,
      { headers: apiHeaders(profToken), tags: { name: 'start_session' } },
    );
    check(res, { 'session started': (r) => r.status === 200 });
  });

  // Allow time for students to join
  sleep(5);

  // Drive each question
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];

    group(`question_${qi + 1}_show`, () => {
      // Navigate to this question
      if (qi > 0) {
        const navRes = http.patch(
          `${API}/sessions/${sessionId}/current`,
          JSON.stringify({ questionId: q.id }),
          { headers: apiHeaders(profToken), tags: { name: 'navigate_question' } },
        );
        check(navRes, { 'navigate ok': (r) => r.status === 200 });
      }

      // Un-hide the question
      const visRes = http.patch(
        `${API}/sessions/${sessionId}/question-visibility`,
        JSON.stringify({ hidden: false }),
        { headers: apiHeaders(profToken), tags: { name: 'show_question' } },
      );
      check(visRes, { 'question shown': (r) => r.status === 200 });

      // Open first attempt
      const attemptRes = http.post(
        `${API}/sessions/${sessionId}/new-attempt`,
        null,
        { headers: apiHeaders(profToken), tags: { name: 'open_attempt' } },
      );
      check(attemptRes, { 'attempt opened': (r) => r.status === 200 });
    });

    // Wait for students to answer
    sleep(ANSWER_WINDOW_S);

    group(`question_${qi + 1}_stats`, () => {
      // Show stats
      const statsRes = http.patch(
        `${API}/sessions/${sessionId}/question-visibility`,
        JSON.stringify({ stats: true }),
        { headers: apiHeaders(profToken), tags: { name: 'show_stats' } },
      );
      check(statsRes, { 'stats shown': (r) => r.status === 200 });
    });

    sleep(STATS_PAUSE_S);

    group(`question_${qi + 1}_correct`, () => {
      // Show correct answer
      const correctRes = http.patch(
        `${API}/sessions/${sessionId}/question-visibility`,
        JSON.stringify({ correct: true }),
        { headers: apiHeaders(profToken), tags: { name: 'show_correct' } },
      );
      check(correctRes, { 'correct shown': (r) => r.status === 200 });
    });

    sleep(CORRECT_PAUSE_S);
  }

  // End session
  group('end_session', () => {
    const res = http.post(
      `${API}/sessions/${sessionId}/end`,
      null,
      { headers: apiHeaders(profToken), tags: { name: 'end_session' } },
    );
    check(res, { 'session ended': (r) => r.status === 200 });
  });
}

/* ── Student flow ───────────────────────────────────────────────── */

export function studentFlow() {
  // Each VU is assigned a unique student from the shared array
  const vuIndex = (__VU - 2) % students.length; // VU 1 = professor, students start at VU 2
  const student = students[vuIndex];
  if (!student) return;

  const sessionId = state.session.id;
  const questions = state.questions;
  let token;

  // 1. Login
  group('student_login', () => {
    const start = Date.now();
    const res = login(student.email, state.password);
    loginDuration.add(Date.now() - start);
    const ok = res.status === 200;
    loginSuccess.add(ok);
    if (!ok) {
      console.warn(`Student ${student.email} login failed: ${res.status}`);
      return;
    }
    token = res.json().token;
  });

  if (!token) return;

  // 2. Join the session (retry a few times – session may not be running yet)
  group('student_join', () => {
    let joined = false;
    for (let attempt = 0; attempt < 10 && !joined; attempt++) {
      const start = Date.now();
      const res = http.post(
        `${API}/sessions/${sessionId}/join`,
        JSON.stringify({}),
        { headers: apiHeaders(token), tags: { name: 'join_session' } },
      );
      joinDuration.add(Date.now() - start);
      if (res.status === 200) {
        joined = true;
      } else {
        // Session may not be running yet
        sleep(1);
      }
    }
    joinSuccess.add(joined);
    if (!joined) {
      console.warn(`Student ${student.email} could not join session`);
    }
  });

  // 3. WebSocket connection for real-time events + answering questions
  group('student_ws_session', () => {
    const wsUrl = `${WS_URL}?token=${token}`;
    let questionsAnswered = 0;

    const res = ws.connect(wsUrl, {}, (socket) => {
      wsConnections.add(1);

      socket.on('open', () => {
        // Send periodic ping to keep alive
        socket.setInterval(() => {
          socket.send(JSON.stringify({ event: 'ping' }));
        }, 15000);
      });

      socket.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }

        const eventReceived = Date.now();

        // Track visibility changes and question navigation
        if (
          msg.event === 'session:question-changed' ||
          msg.event === 'session:visibility-changed' ||
          msg.event === 'session:attempt-changed'
        ) {
          wsEventLatency.add(Date.now() - eventReceived);
        }

        // When a new attempt opens, the student should answer
        if (msg.event === 'session:attempt-changed' && questionsAnswered < questions.length) {
          const q = questions[questionsAnswered];
          // Small random delay to spread load (0-2s)
          const delay = Math.random() * 2;
          socket.setTimeout(() => {
            const answer = generateAnswer(q);
            const start = Date.now();
            const answerRes = http.post(
              `${API}/sessions/${sessionId}/respond`,
              JSON.stringify({ answer }),
              { headers: apiHeaders(token), tags: { name: 'respond' } },
            );
            respondDuration.add(Date.now() - start);
            const ok = answerRes.status === 201 || answerRes.status === 200;
            respondSuccess.add(ok);
            if (!ok) {
              console.warn(
                `Student ${student.email} respond failed (Q${questionsAnswered + 1}): ${answerRes.status} ${answerRes.body}`,
              );
            }
            questionsAnswered++;
          }, delay * 1000);
        }

        // When session ends, close the socket
        if (msg.event === 'session:status-changed') {
          const statusData = msg.data;
          if (statusData && statusData.status === 'done') {
            socket.close();
          }
        }
      });

      socket.on('error', (e) => {
        wsErrors.add(1);
        console.warn(`WebSocket error for ${student.email}: ${e}`);
      });

      // Timeout – close after max duration to avoid hanging
      socket.setTimeout(() => {
        socket.close();
      }, 18 * 60 * 1000); // 18 minutes
    });

    check(res, { 'ws connected': (r) => r && r.status === 101 });
  });
}
