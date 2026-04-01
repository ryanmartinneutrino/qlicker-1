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
 *   • create and upvote chat activity on selected question waves
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampFraction(value, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function seededRatio(a = 0, b = 0, c = 0) {
  const hash = (((a + 1) * 73856093) ^ ((b + 1) * 19349663) ^ ((c + 1) * 83492791)) >>> 0;
  return (hash % 1000) / 1000;
}

function shouldParticipate(fraction, a = 0, b = 0, c = 0) {
  if (fraction <= 0) return false;
  if (fraction >= 1) return true;
  return seededRatio(a, b, c) < fraction;
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const API = `${BASE_URL}/api/v1`;
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const STATE_FILE = __ENV.STATE_FILE || '../state.json';

const ANSWER_WINDOW_S = parseNonNegativeInt(__ENV.ANSWER_WINDOW_S || '30', 30);
const STATS_PAUSE_S = parseNonNegativeInt(__ENV.STATS_PAUSE_S || '15', 15);
const CORRECT_PAUSE_S = parseNonNegativeInt(__ENV.CORRECT_PAUSE_S || '15', 15);
const JOIN_GRACE_S = parseNonNegativeInt(__ENV.JOIN_GRACE_S || '5', 5);
const RESPONSE_ADDED_REFRESH_MS = parseNonNegativeInt(__ENV.RESPONSE_ADDED_REFRESH_MS || '2000', 2000);
const STUDENT_LOGIN_SPREAD_S = parsePositiveFloat(__ENV.STUDENT_LOGIN_SPREAD_S || '12', 12);
const CHAT_ACTIVITY_EVERY_N_QUESTIONS = parsePositiveInt(__ENV.CHAT_ACTIVITY_EVERY_N_QUESTIONS || '2', 2);
const CHAT_VIEWER_STUDENT_FRACTION = clampFraction(__ENV.CHAT_VIEWER_STUDENT_FRACTION || '0.2', 0.2);
const CHAT_QUICK_POST_STUDENT_FRACTION = clampFraction(__ENV.CHAT_QUICK_POST_STUDENT_FRACTION || '0.15', 0.15);
const CHAT_RANDOM_POST_STUDENT_FRACTION = clampFraction(__ENV.CHAT_RANDOM_POST_STUDENT_FRACTION || '0.03', 0.03);
const CHAT_RANDOM_UPVOTE_STUDENT_FRACTION = clampFraction(__ENV.CHAT_RANDOM_UPVOTE_STUDENT_FRACTION || '0.08', 0.08);
const CHAT_ACTION_JITTER_MS = parseNonNegativeInt(__ENV.CHAT_ACTION_JITTER_MS || '1500', 1500);
const CHAT_REPLY_PROFESSOR_LIMIT = parseNonNegativeInt(__ENV.CHAT_REPLY_PROFESSOR_LIMIT || '3', 3);
const PROFESSOR_REPLY_DELAY_MS = parseNonNegativeInt(__ENV.PROFESSOR_REPLY_DELAY_MS || '1500', 1500);

const state = JSON.parse(open(STATE_FILE));
const students = new SharedArray('students', () => state.students);

const loginDuration = new Trend('login_duration', true);
const joinDuration = new Trend('join_duration', true);
const respondDuration = new Trend('respond_duration', true);
const liveRefreshDuration = new Trend('live_refresh_duration', true);
const eventSyncDuration = new Trend('event_sync_duration', true);
const chatRefreshDuration = new Trend('chat_refresh_duration', true);
const chatEventSyncDuration = new Trend('chat_event_sync_duration', true);

const wsConnections = new Counter('ws_connections');
const wsErrors = new Counter('ws_errors');
const responseAddedRefreshes = new Counter('response_added_refreshes');
const chatQuickPostToggles = new Counter('chat_quick_post_toggles');
const chatPostsCreated = new Counter('chat_posts_created');
const chatVotesApplied = new Counter('chat_votes_applied');
const chatRepliesCreated = new Counter('chat_replies_created');

const loginSuccess = new Rate('login_success');
const joinSuccess = new Rate('join_success');
const respondSuccess = new Rate('respond_success');
const liveRefreshSuccess = new Rate('live_refresh_success');
const eventSyncSuccess = new Rate('event_sync_success');
const wsConnectSuccess = new Rate('ws_connect_success');
const professorActionSuccess = new Rate('professor_action_success');
const sessionCompletion = new Rate('session_completion');
const chatRefreshSuccess = new Rate('chat_refresh_success');
const chatEventSyncSuccess = new Rate('chat_event_sync_success');
const chatActionSuccess = new Rate('chat_action_success');

export const options = {
  scenarios: {
    professor: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'professorFlow',
      maxDuration: '20m',
    },
    professor_viewer: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'professorViewerFlow',
      maxDuration: '20m',
      startTime: '1s',
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
    http_req_failed: ['rate==0'],
    ws_errors: ['count==0'],
    'login_success{role:student}': ['rate==1'],
    'login_success{role:professor}': ['rate==1'],
    join_success: ['rate==1'],
    respond_success: ['rate==1'],
    'live_refresh_success{role:student}': ['rate==1'],
    'live_refresh_success{role:professor}': ['rate==1'],
    'event_sync_success{role:student}': ['rate==1'],
    'event_sync_success{role:professor}': ['rate==1'],
    'ws_connect_success{role:student}': ['rate==1'],
    'ws_connect_success{role:professor}': ['rate==1'],
    professor_action_success: ['rate==1'],
    session_completion: ['rate==1'],
    chat_action_success: ['rate==1'],
    'chat_refresh_success{role:student}': ['rate==1'],
    'chat_refresh_success{role:professor}': ['rate==1'],
    'chat_event_sync_success{role:student}': ['rate==1'],
    'chat_event_sync_success{role:professor}': ['rate==1'],
    'login_duration{role:student}': ['p(95)<3000'],
    'login_duration{role:professor}': ['p(95)<3000'],
    join_duration: ['p(95)<3000'],
    respond_duration: ['p(95)<3000'],
    'live_refresh_duration{role:student}': ['p(99)<3000'],
    'live_refresh_duration{role:professor}': ['p(99)<3000'],
    'event_sync_duration{role:student}': ['p(99)<3000'],
    'event_sync_duration{role:professor}': ['p(99)<3000'],
    'chat_refresh_duration{role:student}': ['p(99)<3000'],
    'chat_refresh_duration{role:professor}': ['p(99)<3000'],
    'chat_event_sync_duration{role:student}': ['p(99)<3000'],
    'chat_event_sync_duration{role:professor}': ['p(99)<3000'],
  },
};

function metricTags(role, extra = {}) {
  return { role, ...extra };
}

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
  return http.request(method, `${API}${path}`, body, {
    headers: apiHeaders(token),
    tags: { name: tagName },
  });
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
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

function fetchLive(token, role, reason = 'live_refresh') {
  const startedAtMs = Date.now();
  const res = http.get(`${API}/sessions/${state.session.id}/live`, {
    headers: apiHeaders(token),
    tags: { name: reason },
  });
  const completedAtMs = Date.now();
  liveRefreshDuration.add(completedAtMs - startedAtMs, metricTags(role));

  const ok = res.status === 200;
  liveRefreshSuccess.add(ok, metricTags(role));
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
    data: parseJson(res),
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

function refreshLiveAfterEvent(token, role, reason, expectation = {}, syncContext = null) {
  const result = fetchLive(token, role, `live_${reason}`);
  const ok = result.ok && validateLiveState(result.data, expectation);
  const emittedAtMs = parseTimestampMs(syncContext?.emittedAt);
  const receivedAtMs = Number(syncContext?.receivedAtMs || result.startedAtMs || Date.now());
  const baselineMs = emittedAtMs != null && emittedAtMs <= result.completedAtMs
    ? emittedAtMs
    : receivedAtMs;
  eventSyncDuration.add(Math.max(0, result.completedAtMs - baselineMs), metricTags(role));
  eventSyncSuccess.add(ok, metricTags(role));
  return result.ok ? result.data : null;
}

function buildQueryString(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return '';
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')}`;
}

function collectChatPostIds(chatData = {}) {
  const ids = new Set();
  (Array.isArray(chatData?.posts) ? chatData.posts : []).forEach((post) => {
    if (post?._id) ids.add(String(post._id));
  });
  (Array.isArray(chatData?.quickPosts) ? chatData.quickPosts : []).forEach((post) => {
    if (post?.postId) ids.add(String(post.postId));
  });
  (Array.isArray(chatData?.quickPostOptions) ? chatData.quickPostOptions : []).forEach((post) => {
    if (post?.postId) ids.add(String(post.postId));
  });
  return ids;
}

function validateChatState(data, expectation = {}) {
  if (!data) return false;

  if (expectation.enabled !== undefined && Boolean(data?.enabled) !== Boolean(expectation.enabled)) {
    return false;
  }
  if (expectation.postId) {
    const ids = collectChatPostIds(data);
    if (!ids.has(String(expectation.postId))) return false;
  }
  if (expectation.quickPostQuestionNumber !== undefined) {
    const quickPostMatches = [
      ...(Array.isArray(data?.quickPosts) ? data.quickPosts : []),
      ...(Array.isArray(data?.quickPostOptions) ? data.quickPostOptions : []),
    ].some((post) => Number(post?.questionNumber) === Number(expectation.quickPostQuestionNumber));
    if (!quickPostMatches) return false;
  }
  if (expectation.minPosts !== undefined && (Array.isArray(data?.posts) ? data.posts.length : 0) < Number(expectation.minPosts)) {
    return false;
  }

  return true;
}

function fetchChat(token, role, reason = 'chat_refresh', view = 'live') {
  const startedAtMs = Date.now();
  const queryString = buildQueryString(view && view !== 'live' ? { view } : {});
  const res = http.get(`${API}/sessions/${state.session.id}/chat${queryString}`, {
    headers: apiHeaders(token),
    tags: { name: reason },
  });
  const completedAtMs = Date.now();
  chatRefreshDuration.add(completedAtMs - startedAtMs, metricTags(role));

  const ok = res.status === 200;
  chatRefreshSuccess.add(ok, metricTags(role));
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
    data: parseJson(res),
    res,
    startedAtMs,
    completedAtMs,
  };
}

function refreshChatAfterEvent(token, role, reason, expectation = {}, syncContext = null, view = 'live') {
  const result = fetchChat(token, role, `chat_${reason}`, view);
  const ok = result.ok && validateChatState(result.data, expectation);
  const emittedAtMs = parseTimestampMs(syncContext?.emittedAt);
  const receivedAtMs = Number(syncContext?.receivedAtMs || result.startedAtMs || Date.now());
  const baselineMs = emittedAtMs != null && emittedAtMs <= result.completedAtMs
    ? emittedAtMs
    : receivedAtMs;
  chatEventSyncDuration.add(Math.max(0, result.completedAtMs - baselineMs), metricTags(role));
  chatEventSyncSuccess.add(ok, metricTags(role));
  return result.ok ? result.data : null;
}

function recordChatAction(ok, role, action) {
  chatActionSuccess.add(ok, metricTags(role, { action }));
}

function createChatPost(token, role, body, tagName = 'chat_post') {
  const res = jsonRequest('POST', `/sessions/${state.session.id}/chat/posts`, token, {
    body,
    bodyWysiwyg: body,
  }, tagName);
  const ok = res.status === 200 || res.status === 201;
  recordChatAction(ok, role, 'post');
  if (ok) chatPostsCreated.add(1, metricTags(role));
  return { ok, res, data: parseJson(res) };
}

function toggleQuickPost(token, role, questionNumber, tagName = 'chat_quick_post_toggle') {
  const res = jsonRequest('POST', `/sessions/${state.session.id}/chat/quick-posts/${questionNumber}/toggle`, token, {}, tagName);
  const ok = res.status === 200;
  recordChatAction(ok, role, 'quick_post');
  if (ok) chatQuickPostToggles.add(1, metricTags(role));
  return { ok, res, data: parseJson(res) };
}

function voteChatPost(token, role, postId, upvoted = true, tagName = 'chat_vote') {
  const res = jsonRequest('PATCH', `/sessions/${state.session.id}/chat/posts/${postId}/vote`, token, { upvoted }, tagName);
  const ok = res.status === 200;
  recordChatAction(ok, role, 'vote');
  if (ok) chatVotesApplied.add(1, metricTags(role));
  return { ok, res, data: parseJson(res) };
}

function replyToChatPost(token, role, postId, body, tagName = 'chat_reply') {
  const res = jsonRequest('POST', `/sessions/${state.session.id}/chat/posts/${postId}/comments`, token, {
    body,
    bodyWysiwyg: body,
  }, tagName);
  const ok = res.status === 200 || res.status === 201;
  recordChatAction(ok, role, 'reply');
  if (ok) chatRepliesCreated.add(1, metricTags(role));
  return { ok, res, data: parseJson(res) };
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
    response: ok ? parseJson(res) : null,
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

function isChatWave(questionNumber) {
  return questionNumber > 1 && ((questionNumber - 2) % CHAT_ACTIVITY_EVERY_N_QUESTIONS === 0);
}

function pickQuickPostQuestionNumber(currentQuestionNumber, studentIndex) {
  const priorQuestionCount = Math.max(0, currentQuestionNumber - 1);
  if (priorQuestionCount <= 0) return null;
  const recentWindow = Math.min(priorQuestionCount, 2);
  return currentQuestionNumber - 1 - (studentIndex % recentWindow);
}

function buildStudentChatBody(questionNumber, studentIndex) {
  const templates = [
    'Could you walk through the reasoning for question %QUESTION%?',
    'I am still unsure how to start question %QUESTION%.',
    'Can we revisit the main idea behind question %QUESTION%?',
  ];
  return templates[(questionNumber + studentIndex) % templates.length]
    .replace('%QUESTION%', String(questionNumber));
}

function buildProfessorReplyBody(post, currentQuestionNumber) {
  if (post?.isQuickPost && Number(post?.quickPostQuestionNumber) > 0) {
    return `Thanks for flagging question ${post.quickPostQuestionNumber}. I will go back over that one.`;
  }
  return `Thanks for the question. I will add a bit more explanation around question ${currentQuestionNumber}.`;
}

function chooseVotableRegularPost(chatData = {}) {
  return (Array.isArray(chatData?.posts) ? chatData.posts : []).find(
    (post) => !post?.dismissed && !post?.isQuickPost && !post?.isOwnPost && !post?.viewerHasUpvoted,
  ) || null;
}

function maybeProfessorReplyToChat(token, currentQuestionNumber, repliedPostIds) {
  if (!isChatWave(currentQuestionNumber)) return false;

  sleep(PROFESSOR_REPLY_DELAY_MS / 1000);
  const chatResult = fetchChat(token, 'professor', `professor_chat_review_${currentQuestionNumber}`);
  const chatData = chatResult.data;
  if (!chatResult.ok || !chatData?.enabled) return false;

  const targetPost = (Array.isArray(chatData?.posts) ? chatData.posts : []).find(
    (post) => !post?.dismissed && !repliedPostIds.has(String(post?._id || '')) && (post?.comments?.length || 0) === 0,
  );
  if (!targetPost?._id) return false;

  const replyResult = replyToChatPost(
    token,
    'professor',
    targetPost._id,
    buildProfessorReplyBody(targetPost, currentQuestionNumber),
    `professor_chat_reply_${currentQuestionNumber}`,
  );
  if (!replyResult.ok) return false;

  repliedPostIds.add(String(targetPost._id));
  fetchChat(token, 'professor', `professor_chat_after_reply_${currentQuestionNumber}`);
  return true;
}

export function professorFlow() {
  const sessionId = state.session.id;
  const questions = state.questions;
  const role = 'professor';
  let professorToken = null;
  let professorReplyCount = 0;
  const repliedPostIds = new Set();

  group('professor_login', () => {
    const start = Date.now();
    const res = login(state.professor.email, state.password);
    loginDuration.add(Date.now() - start, metricTags(role));
    const ok = res.status === 200;
    loginSuccess.add(ok, metricTags(role));
    check(res, { 'professor login 200': (r) => r.status === 200 });
    if (ok) {
      professorToken = parseJson(res)?.token;
    }
  });

  if (!professorToken) {
    return;
  }

  fetchLive(professorToken, role, 'professor_initial_live');

  group('enable_chat', () => {
    professorRequest(
      'PATCH',
      `/sessions/${sessionId}/chat-settings`,
      professorToken,
      { chatEnabled: true },
      'enable_chat',
    );
    fetchChat(professorToken, role, 'professor_initial_chat');
  });

  group('start_session', () => {
    professorRequest('POST', `/sessions/${sessionId}/start`, professorToken, {}, 'start_session');
  });

  sleep(JOIN_GRACE_S);

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const questionNumber = index + 1;

    group(`question_${questionNumber}_open`, () => {
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

    group(`question_${questionNumber}_close`, () => {
      professorRequest(
        'PATCH',
        `/sessions/${sessionId}/toggle-responses`,
        professorToken,
        { closed: true },
        'close_responses',
      );
    });

    group(`question_${questionNumber}_stats`, () => {
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

      if (professorReplyCount < CHAT_REPLY_PROFESSOR_LIMIT && maybeProfessorReplyToChat(professorToken, questionNumber, repliedPostIds)) {
        professorReplyCount += 1;
      }
    });

    sleep(STATS_PAUSE_S);

    group(`question_${questionNumber}_correct`, () => {
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

export function professorViewerFlow() {
  const sessionId = state.session.id;
  const role = 'professor';
  let token = null;
  let liveData = null;
  let chatData = null;
  let chatEnabled = false;
  let sessionEnded = false;
  let responseRefreshScheduled = false;

  group('professor_viewer_login', () => {
    const start = Date.now();
    const res = login(state.professor.email, state.password);
    loginDuration.add(Date.now() - start, metricTags(role));
    const ok = res.status === 200;
    loginSuccess.add(ok, metricTags(role));
    if (ok) {
      token = parseJson(res)?.token;
    }
  });

  if (!token) return;

  liveData = fetchLive(token, role, 'professor_viewer_initial_live').data;
  chatEnabled = Boolean(liveData?.session?.chatEnabled);
  if (chatEnabled) {
    chatData = fetchChat(token, role, 'professor_viewer_initial_chat').data;
  }

  const response = ws.connect(`${WS_URL}?token=${encodeURIComponent(token)}`, {}, (socket) => {
    const refreshLiveObserver = (reason, expectation = {}, syncContext = null) => {
      const refreshed = refreshLiveAfterEvent(token, role, reason, expectation, syncContext);
      if (refreshed) {
        liveData = refreshed;
        chatEnabled = Boolean(refreshed?.session?.chatEnabled);
      }
    };

    socket.on('open', () => {
      wsConnections.add(1, metricTags(role));
      wsConnectSuccess.add(true, metricTags(role));
      liveData = refreshLiveAfterEvent(token, role, 'professor_viewer_ws_open', {}, null) || liveData;
      chatEnabled = Boolean(liveData?.session?.chatEnabled);
      if (chatEnabled) {
        chatData = fetchChat(token, role, 'professor_viewer_ws_open_chat').data || chatData;
      }
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
          refreshLiveObserver('professor_status_changed', { status: data.status }, syncContext);
          if (data.status === 'done') {
            sessionEnded = true;
            socket.close();
          }
          break;
        case 'session:question-changed':
          refreshLiveObserver('professor_question_changed', { questionNumber: data.questionNumber }, syncContext);
          break;
        case 'session:visibility-changed':
          refreshLiveObserver('professor_visibility_changed', {
            hidden: data.hidden,
            stats: data.stats,
            correct: data.correct,
          }, syncContext);
          break;
        case 'session:attempt-changed':
          refreshLiveObserver('professor_attempt_changed', {
            attemptNumber: data?.currentAttempt?.number,
            attemptClosed: data?.currentAttempt?.closed,
          }, syncContext);
          break;
        case 'session:word-cloud-updated':
          refreshLiveObserver('professor_word_cloud_updated', { requireWordCloud: true }, syncContext);
          break;
        case 'session:histogram-updated':
          refreshLiveObserver('professor_histogram_updated', { requireHistogram: true }, syncContext);
          break;
        case 'session:response-added':
          if (responseRefreshScheduled) break;
          responseRefreshScheduled = true;
          socket.setTimeout(() => {
            responseRefreshScheduled = false;
            responseAddedRefreshes.add(1, metricTags(role));
            refreshLiveObserver('professor_response_added', {}, syncContext);
          }, RESPONSE_ADDED_REFRESH_MS);
          break;
        case 'session:metadata-changed':
        case 'session:join-code-changed':
          refreshLiveObserver('professor_metadata_changed', {}, syncContext);
          break;
        case 'session:chat-settings-changed':
          chatEnabled = Boolean(data?.chatEnabled);
          if (chatEnabled) {
            chatData = refreshChatAfterEvent(token, role, 'professor_chat_settings_changed', { enabled: true }, syncContext) || chatData;
          }
          break;
        case 'session:chat-updated':
          if (chatEnabled) {
            chatData = refreshChatAfterEvent(token, role, 'professor_chat_updated', { postId: data.postId }, syncContext) || chatData;
          }
          break;
        default:
          break;
      }
    });

    socket.on('error', (err) => {
      wsErrors.add(1, metricTags(role));
      console.warn(`Professor viewer WebSocket error: ${String(err)}`);
    });

    socket.setTimeout(() => {
      socket.close();
    }, 18 * 60 * 1000);
  });

  check(response, { 'professor viewer ws connected': (res) => res && res.status === 101 });
  if (!response || response.status !== 101) {
    wsConnectSuccess.add(false, metricTags(role));
    return;
  }

  if (!sessionEnded && liveData?.session?.status !== 'done') {
    chatData = chatData || null;
  }
}

export function studentFlow() {
  const studentIndex = exec.scenario.iterationInTest;
  if (studentIndex < 0 || studentIndex >= students.length) {
    return;
  }

  const student = students[studentIndex];
  const sessionId = state.session.id;
  const role = 'student';
  const watchesChat = shouldParticipate(CHAT_VIEWER_STUDENT_FRACTION, studentIndex, students.length, 11);
  const usesChat = watchesChat
    || CHAT_QUICK_POST_STUDENT_FRACTION > 0
    || CHAT_RANDOM_POST_STUDENT_FRACTION > 0
    || CHAT_RANDOM_UPVOTE_STUDENT_FRACTION > 0;
  let token = null;
  let liveData = null;
  let chatData = null;
  let chatEnabled = false;

  if (STUDENT_LOGIN_SPREAD_S > 0) {
    sleep(seededRatio(studentIndex, students.length, 19) * STUDENT_LOGIN_SPREAD_S);
  }

  group('student_login', () => {
    const start = Date.now();
    const res = login(student.email, state.password);
    loginDuration.add(Date.now() - start, metricTags(role));
    const ok = res.status === 200;
    loginSuccess.add(ok, metricTags(role));
    if (ok) {
      token = parseJson(res)?.token;
    }
  });

  if (!token) {
    joinSuccess.add(false);
    respondSuccess.add(false);
    liveRefreshSuccess.add(false, metricTags(role));
    return;
  }

  liveData = fetchLive(token, role, 'student_initial_live').data;
  chatEnabled = Boolean(liveData?.session?.chatEnabled);

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

      liveData = fetchLive(token, role, 'student_join_retry').data || liveData;
      chatEnabled = Boolean(liveData?.session?.chatEnabled);
      sleep(1);
    }

    if (joined) {
      liveData = refreshLiveAfterEvent(token, role, 'post_join', { isJoined: true, status: 'running' }) || liveData;
      joined = Boolean(liveData?.isJoined);
      chatEnabled = Boolean(liveData?.session?.chatEnabled);
      if (chatEnabled && watchesChat) {
        chatData = fetchChat(token, role, 'student_initial_chat').data;
      }
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
    const completedChatWaves = new Set();
    const ownPostIds = new Set();
    let createdRandomPostCount = 0;
    let responseRefreshScheduled = false;
    let sessionEnded = false;

    const response = ws.connect(wsUrl, {}, (socket) => {
      const ensureChatSnapshot = (reason) => {
        if (!chatEnabled || !usesChat) return chatData;
        const refreshed = fetchChat(token, role, reason).data;
        if (refreshed) {
          chatData = refreshed;
        }
        return chatData;
      };

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
          const latest = fetchLive(token, role, 'pre_submit_live').data || snapshot;
          liveData = latest;
          chatEnabled = Boolean(latest?.session?.chatEnabled);

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
        const refreshed = refreshLiveAfterEvent(token, role, reason, expectation, syncContext);
        if (refreshed) {
          liveData = refreshed;
          chatEnabled = Boolean(refreshed?.session?.chatEnabled);
        }
        maybeSubmitCurrentAttempt(liveData);
      };

      const runChatWave = (questionNumber) => {
        if (!chatEnabled || !usesChat || !isChatWave(questionNumber)) return;

        const currentQuestionNumber = Number(liveData?.questionNumber || questionNumber || 0);
        if (currentQuestionNumber <= 1) return;

        const quickPostQuestionNumber = pickQuickPostQuestionNumber(currentQuestionNumber, studentIndex);
        const wantsQuickPost = !!quickPostQuestionNumber
          && shouldParticipate(CHAT_QUICK_POST_STUDENT_FRACTION, studentIndex, currentQuestionNumber, 31);
        const wantsRandomPost = createdRandomPostCount < 1
          && shouldParticipate(CHAT_RANDOM_POST_STUDENT_FRACTION, studentIndex, currentQuestionNumber, 43);
        const wantsRandomUpvote = shouldParticipate(CHAT_RANDOM_UPVOTE_STUDENT_FRACTION, studentIndex, currentQuestionNumber, 59);
        if (!wantsQuickPost && !wantsRandomPost && !wantsRandomUpvote) return;

        let snapshot = ensureChatSnapshot(`student_chat_wave_${questionNumber}_start`);
        if (!snapshot?.enabled) return;

        if (wantsQuickPost) {
          const quickPostOption = (Array.isArray(snapshot?.quickPostOptions) ? snapshot.quickPostOptions : []).find(
            (option) => Number(option?.questionNumber) === Number(quickPostQuestionNumber),
          );
          if (quickPostOption && !quickPostOption.viewerHasUpvoted) {
            const result = toggleQuickPost(token, role, quickPostQuestionNumber, `student_quick_post_${currentQuestionNumber}`);
            if (result.ok) {
              snapshot = ensureChatSnapshot(`student_chat_after_quick_post_${currentQuestionNumber}`) || snapshot;
            }
          }
        }

        if (wantsRandomPost) {
          const result = createChatPost(
            token,
            role,
            buildStudentChatBody(currentQuestionNumber, studentIndex),
            `student_chat_post_${currentQuestionNumber}`,
          );
          if (result.ok) {
            if (result.data?.postId) {
              ownPostIds.add(String(result.data.postId));
            }
            createdRandomPostCount += 1;
            snapshot = ensureChatSnapshot(`student_chat_after_post_${currentQuestionNumber}`) || snapshot;
          }
        }

        if (wantsRandomUpvote) {
          const targetPost = chooseVotableRegularPost(snapshot);
          if (targetPost?._id && !ownPostIds.has(String(targetPost._id))) {
            const result = voteChatPost(token, role, targetPost._id, true, `student_chat_vote_${currentQuestionNumber}`);
            if (result.ok) {
              snapshot = ensureChatSnapshot(`student_chat_after_vote_${currentQuestionNumber}`) || snapshot;
            }
          }
        }
      };

      const scheduleChatWave = (questionNumber) => {
        if (!chatEnabled || !usesChat || !isChatWave(questionNumber) || completedChatWaves.has(questionNumber)) {
          return;
        }
        completedChatWaves.add(questionNumber);
        socket.setTimeout(() => {
          runChatWave(questionNumber);
        }, seededRatio(studentIndex, questionNumber, 71) * CHAT_ACTION_JITTER_MS);
      };

      socket.on('open', () => {
        wsConnections.add(1, metricTags(role));
        wsConnectSuccess.add(true, metricTags(role));
        liveData = refreshLiveAfterEvent(token, role, 'ws_open', { isJoined: true }) || liveData;
        chatEnabled = Boolean(liveData?.session?.chatEnabled);
        if (chatEnabled && watchesChat) {
          chatData = fetchChat(token, role, 'student_ws_open_chat').data || chatData;
        }
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
              role,
              'status_changed',
              { status: data.status },
              syncContext,
            ) || liveData;
            chatEnabled = Boolean(liveData?.session?.chatEnabled);
            if (data.status === 'done') {
              sessionEnded = true;
              socket.close();
            }
            break;

          case 'session:question-changed':
            refreshForEvent('question_changed', { questionNumber: data.questionNumber }, syncContext);
            scheduleChatWave(Number(data?.questionNumber || liveData?.questionNumber || 0));
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
              role,
              'word_cloud_updated',
              { requireWordCloud: true },
              syncContext,
            ) || liveData;
            chatEnabled = Boolean(liveData?.session?.chatEnabled);
            break;

          case 'session:histogram-updated':
            liveData = refreshLiveAfterEvent(
              token,
              role,
              'histogram_updated',
              { requireHistogram: true },
              syncContext,
            ) || liveData;
            chatEnabled = Boolean(liveData?.session?.chatEnabled);
            break;

          case 'session:chat-settings-changed':
            chatEnabled = Boolean(data?.chatEnabled);
            if (chatEnabled && watchesChat) {
              chatData = refreshChatAfterEvent(token, role, 'settings_changed', { enabled: true }, syncContext) || chatData;
            }
            break;

          case 'session:chat-updated':
            if (chatEnabled && watchesChat) {
              chatData = refreshChatAfterEvent(token, role, 'updated', { postId: data.postId }, syncContext) || chatData;
            }
            break;

          case 'session:response-added':
            if (responseRefreshScheduled) break;
            responseRefreshScheduled = true;
            socket.setTimeout(() => {
              responseRefreshScheduled = false;
              responseAddedRefreshes.add(1, metricTags(role));
              liveData = refreshLiveAfterEvent(token, role, 'response_added_live', {}, syncContext) || liveData;
              chatEnabled = Boolean(liveData?.session?.chatEnabled);
            }, RESPONSE_ADDED_REFRESH_MS);
            break;

          default:
            break;
        }
      });

      socket.on('error', (err) => {
        wsErrors.add(1, metricTags(role));
        console.warn(`WebSocket error for ${student.email}: ${String(err)}`);
      });

      socket.setTimeout(() => {
        socket.close();
      }, 18 * 60 * 1000);
    });

    check(response, { 'ws connected': (res) => res && res.status === 101 });
    if (!response || response.status !== 101) {
      wsConnectSuccess.add(false, metricTags(role));
      sessionCompletion.add(false);
      return;
    }

    sessionCompletion.add(sessionEnded || liveData?.session?.status === 'done');
  });
}
