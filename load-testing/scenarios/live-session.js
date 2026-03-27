/**
 * live-session.js — k6 load test for a realistic Qlicker interactive session.
 *
 * The professor drives a five-question live session through the same REST
 * endpoints the real UI uses. Students:
 *   • log in with seeded accounts
 *   • fetch /sessions/:id/live
 *   • join the running session
 *   • keep a WebSocket open for live deltas
 *   • re-fetch /live when the app would refresh its state
 *   • submit responses for each open attempt
 *
 * This exercises both the real-time transport and the "device stays in sync"
 * path the browser actually uses during class.
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const STATE_FILE = __ENV.STATE_FILE || '../state.json';

const ANSWER_WINDOW_S = parseInt(__ENV.ANSWER_WINDOW_S || '30', 10);
const STATS_PAUSE_S = parseInt(__ENV.STATS_PAUSE_S || '15', 10);
const CORRECT_PAUSE_S = parseInt(__ENV.CORRECT_PAUSE_S || '15', 10);
const JOIN_GRACE_S = parseInt(__ENV.JOIN_GRACE_S || '5', 10);
const RESPONSE_ADDED_REFRESH_MS = parseInt(__ENV.RESPONSE_ADDED_REFRESH_MS || '2000', 10);

const state = JSON.parse(open(STATE_FILE));
const students = new SharedArray('students', () => state.students);

const loginDuration = new Trend('login_duration', true);
const joinDuration = new Trend('join_duration', true);
const respondDuration = new Trend('respond_duration', true);
const liveRefreshDuration = new Trend('live_refresh_duration', true);
const eventSyncDuration = new Trend('event_sync_duration', true);

const wsConnections = new Counter('ws_connections');
const wsErrors = new Counter('ws_errors');
const responseAddedRefreshes = new Counter('response_added_refreshes');

const loginSuccess = new Rate('login_success');
const joinSuccess = new Rate('join_success');
const respondSuccess = new Rate('respond_success');
const liveRefreshSuccess = new Rate('live_refresh_success');
const eventSyncSuccess = new Rate('event_sync_success');
const wsConnectSuccess = new Rate('ws_connect_success');
const professorActionSuccess = new Rate('professor_action_success');
const sessionCompletion = new Rate('session_completion');

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
      startTime: '3s',
    },
  },
  thresholds: {
    // k6 Trend thresholds are in milliseconds, so p(99)<3000 means 99% under 3s.
    http_req_failed: ['rate==0'],
    ws_errors: ['count==0'],
    login_success: ['rate==1'],
    join_success: ['rate==1'],
    respond_success: ['rate==1'],
    live_refresh_success: ['rate==1'],
    event_sync_success: ['rate==1'],
    ws_connect_success: ['rate==1'],
    professor_action_success: ['rate==1'],
    session_completion: ['rate==1'],
    login_duration: ['p(95)<3000'],
    join_duration: ['p(95)<3000'],
    respond_duration: ['p(95)<3000'],
    live_refresh_duration: ['p(99)<3000'],
    event_sync_duration: ['p(99)<3000'],
  },
};

function apiHeaders(token) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function login(email, password) {
  return http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: apiHeaders(), tags: { name: 'login' } },
  );
}

function jsonRequest(method, path, token, payload, tagName) {
  const body = payload === undefined ? null : JSON.stringify(payload);
  const res = http.request(method, `${API}${path}`, body, {
    headers: apiHeaders(token),
    tags: { name: tagName },
  });
  return res;
}

function parseTimestampMs(value) {
  if (value == null || value === '') return null;
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function isTrueFalseOptions(options = []) {
  if (!Array.isArray(options) || options.length !== 2) return false;
  const labels = options.map((option) => String(option?.answer || option?.plainText || option?.content || '')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .toUpperCase());
  return labels.includes('TRUE') && labels.includes('FALSE');
}

function countCorrectOptions(options = []) {
  return (Array.isArray(options) ? options : []).filter((option) => !!option?.correct).length;
}

function normalizeQuestionType(question = {}) {
  const rawType = Number(question?.type);
  const options = Array.isArray(question?.options) ? question.options : [];

  if ([0, 1, 2, 3, 6].includes(rawType)) return rawType;
  if (rawType === 4) {
    if (options.length > 1) {
      if (isTrueFalseOptions(options)) return 1;
      return countCorrectOptions(options) > 1 ? 3 : 0;
    }
    return 4;
  }
  if (rawType === 5) return 4;
  return 2;
}

function fetchLive(token, reason = 'live_refresh') {
  const startedAtMs = Date.now();
  const res = http.get(`${API}/sessions/${state.session.id}/live`, {
    headers: apiHeaders(token),
    tags: { name: reason },
  });
  const completedAtMs = Date.now();
  liveRefreshDuration.add(completedAtMs - startedAtMs);

  const ok = res.status === 200;
  liveRefreshSuccess.add(ok);
  if (!ok) {
    return {
      ok: false,
      data: null,
      res,
      startedAtMs,
      completedAtMs,
    };
  }

  return {
    ok: true,
    data: res.json(),
    res,
    startedAtMs,
    completedAtMs,
  };
}

function validateLiveState(data, expectation = {}) {
  if (!data) return false;

  if (expectation.status !== undefined && String(data?.session?.status || '') !== String(expectation.status)) {
    return false;
  }
  if (expectation.isJoined !== undefined && Boolean(data?.isJoined) !== Boolean(expectation.isJoined)) {
    return false;
  }
  if (expectation.questionNumber !== undefined && Number(data?.questionNumber || 0) !== Number(expectation.questionNumber)) {
    return false;
  }
  if (expectation.hidden !== undefined && Boolean(data?.questionHidden) !== Boolean(expectation.hidden)) {
    return false;
  }
  if (expectation.stats !== undefined && Boolean(data?.showStats) !== Boolean(expectation.stats)) {
    return false;
  }
  if (expectation.correct !== undefined && Boolean(data?.showCorrect) !== Boolean(expectation.correct)) {
    return false;
  }
  if (
    expectation.attemptNumber !== undefined
    && Number(data?.currentAttempt?.number || 0) !== Number(expectation.attemptNumber)
  ) {
    return false;
  }
  if (
    expectation.attemptClosed !== undefined
    && Boolean(data?.currentAttempt?.closed) !== Boolean(expectation.attemptClosed)
  ) {
    return false;
  }
  if (expectation.requireWordCloud && !data?.wordCloudData) {
    return false;
  }
  if (expectation.requireHistogram && !data?.histogramData) {
    return false;
  }

  return true;
}

function refreshLiveAfterEvent(token, reason, expectation = {}, syncContext = null) {
  const result = fetchLive(token, `live_${reason}`);
  const ok = result.ok && validateLiveState(result.data, expectation);
  const emittedAtMs = parseTimestampMs(syncContext?.emittedAt);
  const receivedAtMs = Number(syncContext?.receivedAtMs || result.startedAtMs || Date.now());
  const baselineMs = emittedAtMs != null && emittedAtMs <= result.completedAtMs
    ? emittedAtMs
    : receivedAtMs;
  eventSyncDuration.add(Math.max(0, result.completedAtMs - baselineMs));
  eventSyncSuccess.add(ok);
  return result.ok ? result.data : null;
}

function optionId(question, index) {
  return String(question?.options?.[index]?._id ?? index);
}

function randomOptionIds(question, minSelections = 1) {
  const picks = new Set();
  const optionCount = Array.isArray(question?.options) ? question.options.length : 0;
  const maxSelections = Math.min(optionCount, Math.max(minSelections, 3));
  const selectionCount = Math.max(
    minSelections,
    Math.min(maxSelections, Math.floor(Math.random() * maxSelections) + 1),
  );

  while (picks.size < selectionCount && picks.size < optionCount) {
    picks.add(optionId(question, Math.floor(Math.random() * optionCount)));
  }

  return [...picks].sort();
}

function buildResponsePayload(question) {
  const type = normalizeQuestionType(question);
  const optionCount = Array.isArray(question?.options) ? question.options.length : 0;

  if ((type === 0 || type === 1) && optionCount > 0) {
    return { answer: optionId(question, Math.floor(Math.random() * optionCount)) };
  }

  if (type === 3 && optionCount > 0) {
    return { answer: randomOptionIds(question, 1) };
  }

  if (type === 2) {
    return { answer: 'Au' };
  }

  if (type === 4) {
    return { answer: String((3.14 + (Math.random() - 0.5) * 0.1).toFixed(2)) };
  }

  return { answer: '' };
}

function submitResponse(token, liveData) {
  const question = liveData?.currentQuestion;
  const attemptNumber = Number(liveData?.currentAttempt?.number || 0);
  if (!question || !attemptNumber) {
    return { ok: false, key: null };
  }

  const payload = buildResponsePayload(question);
  const start = Date.now();
  const res = http.post(
    `${API}/sessions/${state.session.id}/respond`,
    JSON.stringify(payload),
    { headers: apiHeaders(token), tags: { name: 'respond' } },
  );
  respondDuration.add(Date.now() - start);

  const ok = res.status === 200 || res.status === 201;
  respondSuccess.add(ok);
  return {
    ok,
    key: `${String(question._id || '')}:${attemptNumber}`,
    response: ok ? res.json() : null,
    res,
  };
}

function professorRequest(method, path, token, payload, tagName, expectedStatuses = [200]) {
  const res = jsonRequest(method, path, token, payload, tagName);
  const ok = expectedStatuses.includes(res.status);
  professorActionSuccess.add(ok);
  check(res, { [`${tagName} ok`]: () => ok });
  return res;
}

export function professorFlow() {
  const sessionId = state.session.id;
  const questions = state.questions;
  let professorToken = null;

  group('professor_login', () => {
    const start = Date.now();
    const res = login(state.professor.email, state.password);
    loginDuration.add(Date.now() - start);
    const ok = res.status === 200;
    loginSuccess.add(ok);
    check(res, { 'professor login 200': (r) => r.status === 200 });
    if (ok) {
      professorToken = res.json().token;
    }
  });

  if (!professorToken) {
    return;
  }

  fetchLive(professorToken, 'professor_initial_live');

  group('start_session', () => {
    professorRequest('POST', `/sessions/${sessionId}/start`, professorToken, {}, 'start_session');
  });

  sleep(JOIN_GRACE_S);

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];

    group(`question_${index + 1}_open`, () => {
      if (index > 0) {
        professorRequest(
          'PATCH',
          `/sessions/${sessionId}/current`,
          professorToken,
          { questionId: question.id },
          'navigate_question',
        );
      }

      professorRequest(
        'PATCH',
        `/sessions/${sessionId}/question-visibility`,
        professorToken,
        { hidden: false, stats: false, correct: false },
        'show_question',
      );

      professorRequest(
        'POST',
        `/sessions/${sessionId}/new-attempt`,
        professorToken,
        {},
        'open_attempt',
      );
    });

    sleep(ANSWER_WINDOW_S);

    group(`question_${index + 1}_close`, () => {
      professorRequest(
        'PATCH',
        `/sessions/${sessionId}/toggle-responses`,
        professorToken,
        { closed: true },
        'close_responses',
      );
    });

    group(`question_${index + 1}_stats`, () => {
      professorRequest(
        'PATCH',
        `/sessions/${sessionId}/question-visibility`,
        professorToken,
        { hidden: false, stats: true, correct: false },
        'show_stats',
      );

      if (Number(question.type) === 2) {
        professorRequest(
          'POST',
          `/sessions/${sessionId}/word-cloud`,
          professorToken,
          { stopWords: [] },
          'generate_word_cloud',
        );
      }

      if (Number(question.type) === 4) {
        professorRequest(
          'POST',
          `/sessions/${sessionId}/histogram`,
          professorToken,
          {},
          'generate_histogram',
        );
      }
    });

    sleep(STATS_PAUSE_S);

    group(`question_${index + 1}_correct`, () => {
      professorRequest(
        'PATCH',
        `/sessions/${sessionId}/question-visibility`,
        professorToken,
        { hidden: false, stats: true, correct: true },
        'show_correct',
      );
    });

    sleep(CORRECT_PAUSE_S);
  }

  group('end_session', () => {
    professorRequest('POST', `/sessions/${sessionId}/end`, professorToken, {}, 'end_session');
  });
}

export function studentFlow() {
  const studentIndex = exec.scenario.iterationInTest;
  if (studentIndex < 0 || studentIndex >= students.length) {
    return;
  }

  const student = students[studentIndex];
  const sessionId = state.session.id;
  let token = null;
  let liveData = null;

  group('student_login', () => {
    const start = Date.now();
    const res = login(student.email, state.password);
    loginDuration.add(Date.now() - start);
    const ok = res.status === 200;
    loginSuccess.add(ok);
    if (ok) {
      token = res.json().token;
    }
  });

  if (!token) {
    joinSuccess.add(false);
    respondSuccess.add(false);
    liveRefreshSuccess.add(false);
    return;
  }

  liveData = fetchLive(token, 'student_initial_live').data;

  let joined = false;
  group('student_join', () => {
    for (let attempt = 0; attempt < 30 && !joined; attempt += 1) {
      const start = Date.now();
      const res = http.post(
        `${API}/sessions/${sessionId}/join`,
        JSON.stringify({}),
        { headers: apiHeaders(token), tags: { name: 'join_session' } },
      );
      joinDuration.add(Date.now() - start);

      if (res.status === 200) {
        joined = true;
        break;
      }

      liveData = fetchLive(token, 'student_join_retry').data || liveData;
      sleep(1);
    }

    if (joined) {
      liveData = refreshLiveAfterEvent(token, 'post_join', { isJoined: true, status: 'running' }) || liveData;
      joined = Boolean(liveData?.isJoined);
    }

    joinSuccess.add(joined);
  });

  if (!joined) {
    respondSuccess.add(false);
    sessionCompletion.add(false);
    return;
  }

  group('student_ws_session', () => {
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const submittedAttempts = {};
    const scheduledAttempts = {};
    let responseRefreshScheduled = false;
    let sessionEnded = false;

    const response = ws.connect(wsUrl, {}, (socket) => {
      const maybeSubmitCurrentAttempt = (snapshot) => {
        const currentQuestion = snapshot?.currentQuestion;
        const currentAttempt = snapshot?.currentAttempt;
        if (!currentQuestion || !currentAttempt) return;
        if (snapshot?.questionHidden) return;
        if (currentAttempt.closed) return;
        if (snapshot?.studentResponse) return;

        const attemptKey = `${String(currentQuestion._id || '')}:${Number(currentAttempt.number || 0)}`;
        if (!attemptKey || submittedAttempts[attemptKey] || scheduledAttempts[attemptKey]) {
          return;
        }

        scheduledAttempts[attemptKey] = true;
        socket.setTimeout(() => {
          const latest = fetchLive(token, 'pre_submit_live').data || snapshot;
          liveData = latest;

          if (
            !latest?.currentQuestion
            || latest?.questionHidden
            || latest?.currentAttempt?.closed
            || latest?.studentResponse
          ) {
            delete scheduledAttempts[attemptKey];
            return;
          }

          const submitted = submitResponse(token, latest);
          if (submitted.ok) {
            submittedAttempts[attemptKey] = true;
            if (submitted.response?.response) {
              liveData = {
                ...latest,
                studentResponse: submitted.response.response,
              };
            }
          }

          delete scheduledAttempts[attemptKey];
        }, Math.random() * 2000);
      };

      const refreshForEvent = (reason, expectation = {}, syncContext = null) => {
        const refreshed = refreshLiveAfterEvent(token, reason, expectation, syncContext);
        if (refreshed) {
          liveData = refreshed;
        }
        maybeSubmitCurrentAttempt(liveData);
      };

      socket.on('open', () => {
        wsConnections.add(1);
        wsConnectSuccess.add(true);
        liveData = refreshLiveAfterEvent(token, 'ws_open', { isJoined: true }) || liveData;
        maybeSubmitCurrentAttempt(liveData);
        socket.setInterval(() => {
          socket.send(JSON.stringify({ event: 'ping' }));
        }, 15000);
      });

      socket.on('message', (raw) => {
        const receivedAtMs = Date.now();
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }

        const event = message?.event;
        const data = message?.data || {};
        if (!event || String(data?.sessionId || '') !== String(sessionId)) {
          return;
        }
        const syncContext = {
          emittedAt: data?.emittedAt,
          receivedAtMs,
        };

        switch (event) {
          case 'session:status-changed':
            liveData = refreshLiveAfterEvent(
              token,
              'status_changed',
              { status: data.status },
              syncContext,
            ) || liveData;
            if (data.status === 'done') {
              sessionEnded = true;
              socket.close();
            }
            break;

          case 'session:question-changed':
            refreshForEvent('question_changed', { questionNumber: data.questionNumber }, syncContext);
            break;

          case 'session:visibility-changed':
            refreshForEvent('visibility_changed', {
              hidden: data.hidden,
              stats: data.stats,
              correct: data.correct,
            }, syncContext);
            break;

          case 'session:attempt-changed':
            refreshForEvent('attempt_changed', {
              attemptNumber: data?.currentAttempt?.number,
              attemptClosed: data?.currentAttempt?.closed,
            }, syncContext);
            break;

          case 'session:word-cloud-updated':
            liveData = refreshLiveAfterEvent(
              token,
              'word_cloud_updated',
              { requireWordCloud: true },
              syncContext,
            ) || liveData;
            break;

          case 'session:histogram-updated':
            liveData = refreshLiveAfterEvent(
              token,
              'histogram_updated',
              { requireHistogram: true },
              syncContext,
            ) || liveData;
            break;

          case 'session:response-added':
            if (responseRefreshScheduled) break;
            responseRefreshScheduled = true;
            socket.setTimeout(() => {
              responseRefreshScheduled = false;
              responseAddedRefreshes.add(1);
              liveData = refreshLiveAfterEvent(token, 'response_added_live', {}, syncContext) || liveData;
            }, RESPONSE_ADDED_REFRESH_MS);
            break;

          default:
            break;
        }
      });

      socket.on('error', (err) => {
        wsErrors.add(1);
        console.warn(`WebSocket error for ${student.email}: ${String(err)}`);
      });

      socket.setTimeout(() => {
        socket.close();
      }, 18 * 60 * 1000);
    });

    check(response, { 'ws connected': (res) => res && res.status === 101 });
    if (!response || response.status !== 101) {
      wsConnectSuccess.add(false);
      sessionCompletion.add(false);
      return;
    }

    sessionCompletion.add(sessionEnded || liveData?.session?.status === 'done');
  });
}
