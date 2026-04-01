import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ChatBubbleOutline as CommentIcon,
  DeleteOutline as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Remove as RemoveIcon,
  VisibilityOff as DismissIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiClient from '../../api/client';
import StudentRichTextEditor, { MathPreview } from '../questions/StudentRichTextEditor';
import {
  extractPlainTextFromHtml,
  prepareRichTextInput,
  renderKatexInElement,
} from '../questions/richTextUtils';

const richContentSx = {
  '& p': { my: 0.5 },
  '& ul, & ol': { my: 0.5, pl: 3 },
  '& img': {
    display: 'block',
    maxWidth: '100% !important',
    height: 'auto !important',
    borderRadius: 0,
    my: 0.75,
  },
};

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function getAuthorLabel({ authorName, authorRole, canViewNames, t }) {
  if (authorName) return authorName;
  if (authorRole === 'student') return t('sessionChat.anonymousStudent');
  if (authorRole === 'instructor' || authorRole === 'admin') return t('sessionChat.instructor');
  if (authorRole === 'system') return t('sessionChat.system');
  if (canViewNames) return t('sessionChat.unknownAuthor');
  return t('sessionChat.system');
}

function normalizeDraftPlainText(html = '') {
  return extractPlainTextFromHtml(html || '').trim();
}

function RichContent({ html, fallback }) {
  const ref = useRef(null);
  const prepared = useMemo(
    () => prepareRichTextInput(html || '', fallback || '', { allowVideoEmbeds: true }),
    [fallback, html]
  );

  useLayoutEffect(() => {
    if (ref.current && prepared) {
      renderKatexInElement(ref.current);
    }
  }, [prepared]);

  if (!prepared) return null;

  return (
    <Box
      ref={ref}
      sx={richContentSx}
      dangerouslySetInnerHTML={{ __html: prepared }}
    />
  );
}

function CommentThread({
  post,
  expanded,
  onToggle,
  canComment,
  canViewNames,
  commentDraft,
  onCommentDraftChange,
  onSubmitComment,
  submitting,
}) {
  const { t } = useTranslation();
  const hasCommentDraft = normalizeDraftPlainText(commentDraft).length > 0 || (commentDraft || '').trim().length > 0;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        color="inherit"
        onClick={onToggle}
        startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      >
        {t('sessionChat.commentsCount', { count: post.comments.length })}
      </Button>
      <Collapse in={expanded} unmountOnExit>
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          {post.comments.map((comment) => (
            <Paper
              key={comment._id}
              variant="outlined"
              sx={{ p: 1.25, bgcolor: 'action.hover' }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {getAuthorLabel({
                      authorName: comment.authorName,
                      authorRole: comment.authorRole,
                      canViewNames,
                      t,
                    })}
                  </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatTimestamp(comment.createdAt)}
                </Typography>
              </Box>
              <RichContent html={comment.bodyWysiwyg} fallback={comment.body} />
            </Paper>
          ))}
          {canComment && (
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {t('sessionChat.addComment')}
              </Typography>
              <StudentRichTextEditor
                value={commentDraft}
                onChange={({ html }) => onCommentDraftChange(html)}
                showMathHint={false}
                placeholder={t('sessionChat.commentPlaceholder')}
                ariaLabel={t('sessionChat.commentEditorAria')}
              />
              <MathPreview html={commentDraft} showLabel={false} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={onSubmitComment}
                  disabled={!hasCommentDraft || submitting}
                >
                  {submitting ? t('sessionChat.sending') : t('sessionChat.comment')}
                </Button>
              </Box>
            </Paper>
          )}
        </Stack>
      </Collapse>
    </Box>
  );
}

export default function SessionChatPanel({
  sessionId,
  enabled,
  view = 'live',
  role = 'student',
  refreshToken = 0,
  initialData = null,
}) {
  const { t } = useTranslation();
  const [chatData, setChatData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);
  const [composerOpen, setComposerOpen] = useState(role === 'professor');
  const [draftHtml, setDraftHtml] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [pendingCommentId, setPendingCommentId] = useState('');
  const [selectedQuickPostQuestionNumber, setSelectedQuickPostQuestionNumber] = useState('');
  const [submittingQuickPost, setSubmittingQuickPost] = useState(false);
  const chatDataRef = useRef(initialData);

  useEffect(() => {
    chatDataRef.current = initialData;
    setChatData(initialData);
    setLoading(!initialData);
  }, [initialData]);

  const fetchChat = useCallback(async () => {
    if (!enabled) {
      chatDataRef.current = null;
      setChatData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(!chatDataRef.current);
    try {
      const params = {};
      if (view === 'presentation') params.view = 'presentation';
      if (view === 'review') params.view = 'review';
      const { data } = await apiClient.get(`/sessions/${sessionId}/chat`, { params });
      chatDataRef.current = data;
      setChatData(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [enabled, sessionId, t, view]);

  useEffect(() => {
    void fetchChat();
  }, [fetchChat, refreshToken]);

  const canCompose = !!chatData?.canPost && view === 'live';
  const canVote = !!chatData?.canVote && role === 'student';
  const canDismiss = !!chatData?.canDismiss && role === 'professor';
  const canComment = !!chatData?.canComment && view === 'live';
  const canViewNames = !!chatData?.canViewNames;
  const draftHasContent = normalizeDraftPlainText(draftHtml).length > 0 || (draftHtml || '').trim().length > 0;
  const quickPostOptions = useMemo(() => {
    const options = Array.isArray(chatData?.quickPostOptions) && chatData.quickPostOptions.length > 0
      ? chatData.quickPostOptions
      : Array.isArray(chatData?.quickPosts)
        ? chatData.quickPosts
        : [];
    return [...options]
      .filter((option) => Number(option?.questionNumber) > 0)
      .sort((a, b) => Number(b?.questionNumber || 0) - Number(a?.questionNumber || 0));
  }, [chatData?.quickPostOptions, chatData?.quickPosts]);
  const selectedQuickPost = useMemo(
    () => quickPostOptions.find((option) => String(option.questionNumber) === String(selectedQuickPostQuestionNumber))
      || quickPostOptions[0]
      || null,
    [quickPostOptions, selectedQuickPostQuestionNumber]
  );

  useEffect(() => {
    if (quickPostOptions.length === 0) {
      setSelectedQuickPostQuestionNumber('');
      return;
    }

    setSelectedQuickPostQuestionNumber((prev) => (
      quickPostOptions.some((option) => String(option.questionNumber) === String(prev))
        ? prev
        : String(quickPostOptions[0].questionNumber)
    ));
  }, [quickPostOptions]);

  const handleSubmitPost = useCallback(async () => {
    if (!draftHasContent || submittingPost) return;
    setSubmittingPost(true);
    try {
      await apiClient.post(`/sessions/${sessionId}/chat/posts`, {
        body: normalizeDraftPlainText(draftHtml),
        bodyWysiwyg: draftHtml,
      });
      setDraftHtml('');
      setComposerOpen(role === 'professor');
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToSend'));
    } finally {
      setSubmittingPost(false);
    }
  }, [draftHasContent, draftHtml, fetchChat, role, sessionId, submittingPost, t]);

  const handleQuickPostToggle = useCallback(async (questionNumber) => {
    if (!questionNumber || submittingQuickPost) return;
    setSubmittingQuickPost(true);
    try {
      await apiClient.post(`/sessions/${sessionId}/chat/quick-posts/${questionNumber}/toggle`);
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToSend'));
    } finally {
      setSubmittingQuickPost(false);
    }
  }, [fetchChat, sessionId, submittingQuickPost, t]);

  const handleVote = useCallback(async (postId, upvoted) => {
    try {
      await apiClient.patch(`/sessions/${sessionId}/chat/posts/${postId}/vote`, { upvoted });
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToVote'));
    }
  }, [fetchChat, sessionId, t]);

  const handleDismiss = useCallback(async (postId) => {
    try {
      await apiClient.patch(`/sessions/${sessionId}/chat/posts/${postId}/dismiss`);
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToDismiss'));
    }
  }, [fetchChat, sessionId, t]);

  const handleDelete = useCallback(async (postId) => {
    try {
      await apiClient.delete(`/sessions/${sessionId}/chat/posts/${postId}`);
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToDelete'));
    }
  }, [fetchChat, sessionId, t]);

  const handleSubmitComment = useCallback(async (postId) => {
    const draft = commentDrafts[postId] || '';
    if (!normalizeDraftPlainText(draft) && !draft.trim()) return;
    setPendingCommentId(postId);
    try {
      await apiClient.post(`/sessions/${sessionId}/chat/posts/${postId}/comments`, {
        body: normalizeDraftPlainText(draft),
        bodyWysiwyg: draft,
      });
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setExpandedPosts((prev) => ({ ...prev, [postId]: true }));
      await fetchChat();
    } catch (err) {
      setError(err.response?.data?.message || t('sessionChat.failedToComment'));
    } finally {
      setPendingCommentId('');
    }
  }, [commentDrafts, fetchChat, sessionId, t]);

  if (!enabled) {
    return (
      <Alert severity="info">
        {t('sessionChat.disabled')}
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {role === 'student' && view === 'live' ? (
        <Alert severity="info">
          {t('sessionChat.studentNotice')}
        </Alert>
      ) : null}

      {role === 'student' && canVote && quickPostOptions.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('sessionChat.quickPostPrompt')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('sessionChat.quickPostHelper')}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              flexWrap: 'wrap',
              gap: 1,
              alignItems: { sm: 'center' },
            }}
          >
            <TextField
              select
              size="small"
              fullWidth
              label={t('sessionChat.quickPostQuestionLabel')}
              value={selectedQuickPost ? String(selectedQuickPost.questionNumber) : ''}
              onChange={(event) => setSelectedQuickPostQuestionNumber(event.target.value)}
              sx={{ flex: '1 1 240px' }}
            >
              {quickPostOptions.map((quickPost) => (
                <MenuItem
                  key={quickPost.postId}
                  value={String(quickPost.questionNumber)}
                >
                  {t('sessionChat.quickPostLabel', { questionNumber: quickPost.questionNumber })}
                </MenuItem>
              ))}
            </TextField>
            {selectedQuickPost ? (
              <Chip
                size="small"
                variant="outlined"
                label={t('sessionChat.upvotes', { count: selectedQuickPost.upvoteCount })}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
              />
            ) : null}
            <Button
              variant={selectedQuickPost?.viewerHasUpvoted ? 'outlined' : 'contained'}
              onClick={() => handleQuickPostToggle(selectedQuickPost?.questionNumber)}
              disabled={!selectedQuickPost || submittingQuickPost}
              startIcon={selectedQuickPost?.viewerHasUpvoted ? <RemoveIcon /> : <AddIcon />}
              sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}
            >
              {submittingQuickPost
                ? t('sessionChat.sending')
                : selectedQuickPost?.viewerHasUpvoted
                  ? t('sessionChat.undoQuickPost')
                  : t('sessionChat.requestQuickPost')}
            </Button>
          </Box>
        </Paper>
      ) : null}

      {canCompose ? (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mb: composerOpen ? 1.25 : 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {t('sessionChat.newPost')}
            </Typography>
            <Button
              size="small"
              onClick={() => setComposerOpen((prev) => !prev)}
              endIcon={composerOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {composerOpen ? t('sessionChat.hideComposer') : t('sessionChat.showComposer')}
            </Button>
          </Box>
          <Collapse in={composerOpen}>
            <StudentRichTextEditor
              value={draftHtml}
              onChange={({ html }) => setDraftHtml(html)}
              placeholder={t('sessionChat.postPlaceholder')}
              ariaLabel={t('sessionChat.postEditorAria')}
              showMathHint
            />
            <MathPreview html={draftHtml} showLabel={false} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                variant="contained"
                onClick={handleSubmitPost}
                disabled={!draftHasContent || submittingPost}
              >
                {submittingPost ? t('sessionChat.sending') : t('sessionChat.post')}
              </Button>
            </Box>
          </Collapse>
        </Paper>
      ) : null}

      {chatData?.posts?.length > 0 ? (
        <Stack spacing={1.5}>
          {chatData.posts.map((post) => {
            const expanded = !!expandedPosts[post._id];
            const authorLabel = getAuthorLabel({
              authorName: post.authorName,
              authorRole: post.authorRole,
              canViewNames,
              t,
            });
            return (
              <Paper
                key={post._id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderColor: post.dismissed ? 'warning.light' : 'divider',
                  bgcolor: post.dismissed ? 'warning.50' : 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {authorLabel}
                    </Typography>
                    {post.dismissed ? (
                      <Chip size="small" color="warning" label={t('sessionChat.dismissed')} />
                    ) : null}
                    {post.isQuickPost ? (
                      <Chip size="small" variant="outlined" label={t('sessionChat.quickPostChip')} />
                    ) : null}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(post.createdAt)}
                  </Typography>
                </Box>

                <RichContent html={post.bodyWysiwyg} fallback={post.body} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1.25 }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t('sessionChat.upvotes', { count: post.upvoteCount })}
                  />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {canVote && !post.dismissed && !post.isOwnPost ? (
                      <Button
                        size="small"
                        variant={post.viewerHasUpvoted ? 'contained' : 'outlined'}
                        onClick={() => handleVote(post._id, !post.viewerHasUpvoted)}
                        startIcon={post.viewerHasUpvoted ? <RemoveIcon /> : <AddIcon />}
                      >
                        {post.viewerHasUpvoted ? t('sessionChat.undoVote') : t('sessionChat.upvote')}
                      </Button>
                    ) : null}
                    {(canComment || post.comments.length > 0) ? (
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => setExpandedPosts((prev) => ({ ...prev, [post._id]: !prev[post._id] }))}
                        startIcon={<CommentIcon />}
                      >
                        {t('sessionChat.comments')}
                      </Button>
                    ) : null}
                    {post.isOwnPost && view === 'live' ? (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleDelete(post._id)}
                        startIcon={<DeleteIcon />}
                      >
                        {t('common.delete')}
                      </Button>
                    ) : null}
                    {canDismiss && !post.dismissed ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={() => handleDismiss(post._id)}
                        startIcon={<DismissIcon />}
                      >
                        {t('sessionChat.dismiss')}
                      </Button>
                    ) : null}
                  </Box>
                </Box>

                <CommentThread
                  post={post}
                  expanded={expanded}
                  onToggle={() => setExpandedPosts((prev) => ({ ...prev, [post._id]: !prev[post._id] }))}
                  canComment={canComment && !post.dismissed}
                  canViewNames={canViewNames}
                  commentDraft={commentDrafts[post._id] || ''}
                  onCommentDraftChange={(value) => setCommentDrafts((prev) => ({ ...prev, [post._id]: value }))}
                  onSubmitComment={() => handleSubmitComment(post._id)}
                  submitting={pendingCommentId === post._id}
                />
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography color="text.secondary">
            {t('sessionChat.noPosts')}
          </Typography>
        </Paper>
      )}

      {view === 'review' && chatData?.posts?.length > 0 ? (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            {t('sessionChat.reviewNote')}
          </Typography>
        </>
      ) : null}
    </Stack>
  );
}
