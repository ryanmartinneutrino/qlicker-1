import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Course, Question } from '@qlicker/shared'
import { QUESTION_TYPE, QUESTION_TYPE_LABELS } from '../constants/questionTypes'
import { apiClient } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { CreateQuestionModal } from '../components/modals/CreateQuestionModal'
import { useRealtimeCollection } from '../hooks/useRealtimeCollection'
import { QuestionEditItem } from '../components/QuestionEditItem'
import { QuestionDisplay } from '../components/QuestionDisplay'

const DEFAULT_OPTIONS = [{ plainText: 'Option A' }, { plainText: 'Option B' }]
type LibraryView = 'library' | 'public' | 'unapprovedFromStudents'

function toMillis(value: unknown): number {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value as string)
  const millis = date.getTime()
  return Number.isFinite(millis) ? millis : 0
}

export default function QuestionsLibrary() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const userId = user?._id || ''
  const [course, setCourse] = useState<Course | null>(null)
  const [courseLoading, setCourseLoading] = useState(true)
  const [courseError, setCourseError] = useState<string | null>(null)
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryView>('library')
  const fetchPath = useMemo(() => {
    const id = encodeURIComponent(courseId || '')
    return `/questions?courseId=${id}&library=${selectedLibrary}`
  }, [courseId, selectedLibrary])
  const { data, loading, error } = useRealtimeCollection<Question>({
    fetchPath,
    subscribeEvent: 'subscribe:questions-course',
    subscribePayload: { courseId: courseId || '' },
    changeEvent: 'questions:change',
    enabled: Boolean(courseId),
    refetchOnChange: true,
  })

  const [questions, setQuestions] = useState<Question[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [creatingQuestion, setCreatingQuestion] = useState(false)
  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'unapproved' | 'public' | 'mine'>('all')

  useEffect(() => {
    if (!courseId) return
    setCourseLoading(true)
    setCourseError(null)
    apiClient
      .get<Course>(`/courses/${courseId}`)
      .then((loaded) => setCourse(loaded))
      .catch((err) => setCourseError((err as Error).message))
      .finally(() => setCourseLoading(false))
  }, [courseId])

  useEffect(() => {
    const sorted = [...data].sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt))
    setQuestions(sorted)
  }, [data])

  useEffect(() => {
    setEditingId(null)
    setPreviewId(null)
    setActionError(null)
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
  }, [selectedLibrary])

  const isAdmin = Boolean(user?.profile.roles.includes('admin'))
  const isInstructor = Boolean(
    isAdmin ||
      (course &&
        (course.owner === userId || (course.instructors || []).includes(userId)))
  )
  const isStudent = Boolean(!isInstructor && course && (course.students || []).includes(userId))
  const canCreate = Boolean(isInstructor || (isStudent && course?.allowStudentQuestions))

  const ownsQuestion = (question: Question): boolean =>
    Boolean(question.owner === userId || question.creator === userId)

  const canEditQuestion = (question: Question): boolean => {
    if (selectedLibrary !== 'library') return false
    if (isInstructor) return true
    if (!isStudent || !course?.allowStudentQuestions) return false
    return ownsQuestion(question) && !question.approved && !question.public && !question.sessionId
  }

  const canDeleteQuestion = (question: Question): boolean => {
    if (isInstructor) return true
    if (!isStudent) return false
    return canEditQuestion(question)
  }

  const canApproveQuestion = (question: Question): boolean => {
    if (!isInstructor) return false
    if (question.approved && question.creator === userId) return false
    return true
  }

  const canTogglePublic = (question: Question): boolean => {
    if (!isInstructor) return false
    if (selectedLibrary === 'unapprovedFromStudents') return false
    return Boolean(question._id)
  }

  const canCopyQuestion = (question: Question): boolean => {
    if (!isStudent || selectedLibrary !== 'public') return false
    if (!question._id) return false
    return true
  }

  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return questions.filter((question) => {
      if (typeFilter !== 'all' && String(question.type) !== typeFilter) return false
      if (statusFilter === 'approved' && !question.approved) return false
      if (statusFilter === 'unapproved' && question.approved) return false
      if (statusFilter === 'public' && !question.public) return false
      if (statusFilter === 'mine' && !ownsQuestion(question)) return false

      if (!query) return true
      const text = `${question.plainText || ''} ${question.content || ''} ${question.solution || ''}`.toLowerCase()
      return text.includes(query)
    })
  }, [questions, searchQuery, typeFilter, statusFilter, ownsQuestion])

  const handleDelete = async (questionId: string) => {
    if (!window.confirm('Delete this question?')) return
    try {
      setActionError(null)
      setBusyQuestionId(questionId)
      await apiClient.delete(`/questions/${questionId}`)
      setQuestions((prev) => prev.filter((q) => q._id !== questionId))
      if (editingId === questionId) setEditingId(null)
      if (previewId === questionId) setPreviewId(null)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  const handleSaveQuestion = async (question: Question) => {
    try {
      setActionError(null)
      const isChoiceType =
        question.type === QUESTION_TYPE.MC || question.type === QUESTION_TYPE.MS || question.type === QUESTION_TYPE.TF

      const payload: Partial<Question> = {
        plainText: question.plainText,
        content: question.content || question.plainText,
        type: question.type,
        public: question.public,
        solution: question.solution || '',
        solution_plainText: question.solution_plainText || question.solution || '',
        options: isChoiceType
          ? (question.options || DEFAULT_OPTIONS).map((option) => ({
              ...option,
              plainText: option.plainText || option.answer || '',
              answer: option.answer || option.plainText || '',
              content: option.content || option.plainText || option.answer || '',
            }))
          : [],
        correctNumerical: question.type === QUESTION_TYPE.NU ? Number(question.correctNumerical || 0) : 0,
        toleranceNumerical: question.type === QUESTION_TYPE.NU ? Number(question.toleranceNumerical || 0) : 0,
      }
      if (isInstructor) payload.public = Boolean(question.public)

      const updated = await apiClient.put<Question>(`/questions/${question._id}`, payload)
      setQuestions((prev) => prev.map((q) => (q._id === updated._id ? { ...q, ...updated } : q)))
      setEditingId(null)
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const handleToggleApprove = async (question: Question) => {
    if (!question._id || !isInstructor) return
    const nextApproved = !Boolean(question.approved)
    const payload: Partial<Question> = {
      approved: nextApproved,
      public: false,
      owner: nextApproved ? userId : question.creator || question.owner || userId,
    }
    if (nextApproved) payload.createdAt = new Date()

    try {
      setActionError(null)
      setBusyQuestionId(question._id)
      const updated = await apiClient.put<Question>(`/questions/${question._id}`, payload)
      setQuestions((prev) => prev.map((entry) => (entry._id === updated._id ? { ...entry, ...updated } : entry)))
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  const handleTogglePublic = async (question: Question) => {
    if (!question._id || !isInstructor) return
    const nextPublic = !Boolean(question.public)
    const payload: Partial<Question> = {
      public: nextPublic,
      owner: userId,
      approved: nextPublic ? true : Boolean(question.approved),
    }
    if (nextPublic) payload.createdAt = new Date()

    try {
      setActionError(null)
      setBusyQuestionId(question._id)
      const updated = await apiClient.put<Question>(`/questions/${question._id}`, payload)
      setQuestions((prev) => prev.map((entry) => (entry._id === updated._id ? { ...entry, ...updated } : entry)))
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  const handleCopyToLibrary = async (questionId: string) => {
    try {
      setActionError(null)
      setBusyQuestionId(questionId)
      const created = await apiClient.post<Question>(`/questions/${questionId}/copy`, {})
      if (selectedLibrary === 'library') {
        setQuestions((prev) => [created, ...prev])
      }
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setBusyQuestionId(null)
    }
  }

  if (loading || courseLoading) return <div className="page">Loading...</div>
  if (error || courseError) return <div className="page">Error: {error || courseError}</div>

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Question Library</h1>
      </div>

      <div className="container">
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link className="btn btn-secondary" to={`/course/${courseId}`}>
            Back to Course
          </Link>
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setCreatingQuestion(true)}>
              Create Question
            </button>
          )}
        </div>

        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${selectedLibrary === 'library' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedLibrary('library')}
          >
            {isInstructor ? 'Course Library' : 'My Questions'}
          </button>
          <button
            type="button"
            className={`btn ${selectedLibrary === 'public' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedLibrary('public')}
          >
            Public
          </button>
          {isInstructor && (
            <button
              type="button"
              className={`btn ${selectedLibrary === 'unapprovedFromStudents' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedLibrary('unapprovedFromStudents')}
            >
              Student Queue
            </button>
          )}
        </div>

        {actionError && (
          <div className="ql-error" style={{ marginBottom: '0.75rem' }}>
            {actionError}
          </div>
        )}

        {questions.length > 0 && (
          <div className="ql-card" style={{ marginBottom: '0.75rem' }}>
            <div className="ql-card-content" style={{ display: 'grid', gap: '0.5rem' }}>
              <input
                className="form-control"
                type="text"
                placeholder="Search question text or solution"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr 1fr' }}>
                <select className="form-control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">All Types</option>
                  {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                >
                  <option value="all">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="unapproved">Unapproved</option>
                  <option value="public">Public</option>
                  <option value="mine">Owned by Me</option>
                </select>
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={() => {
                    setSearchQuery('')
                    setTypeFilter('all')
                    setStatusFilter('all')
                  }}
                >
                  Clear Filters
                </button>
              </div>
              <div>
                Showing <strong>{filteredQuestions.length}</strong> of {questions.length} questions
              </div>
            </div>
          </div>
        )}

        {creatingQuestion && user?._id && (
          <CreateQuestionModal
            courseId={courseId!}
            userId={user._id}
            canSetPublic={isInstructor}
            done={() => setCreatingQuestion(false)}
            onCreated={(created) => {
              setQuestions((prev) => [created, ...prev])
              setSelectedLibrary('library')
              setEditingId(created._id || null)
            }}
          />
        )}

        {questions.length === 0 ? (
          <p>
            {selectedLibrary === 'public'
              ? 'No public questions are available.'
              : selectedLibrary === 'unapprovedFromStudents'
                ? 'No student submissions are waiting for approval.'
                : 'No questions in this library yet.'}
          </p>
        ) : filteredQuestions.length === 0 ? (
          <p>No questions match the active filters.</p>
        ) : (
          <div>
            {filteredQuestions.map((question, index) => (
              // Keeping each question self-contained limits edit-state conflicts when
              // realtime updates reorder filtered libraries.
              <div
                key={question._id}
                className="ql-list-item"
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid #eee',
                }}
              >
                <div style={{ marginBottom: '0.35rem', fontSize: '0.85em', opacity: 0.8, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>{QUESTION_TYPE_LABELS[question.type] ?? `Type ${question.type}`}</span>
                  <span>{question.approved ? 'Approved' : 'Unapproved'}</span>
                  {question.public && <span>Public</span>}
                </div>

                <QuestionEditItem
                  question={{
                    ...question,
                    options: question.options || [],
                    type: question.type,
                  }}
                  index={index}
                  isEditing={editingId === question._id}
                  onStartEdit={() => setEditingId(question._id || null)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => handleDelete(question._id || '')}
                  onSave={handleSaveQuestion}
                  canEdit={canEditQuestion(question)}
                  canDelete={canDeleteQuestion(question)}
                  allowPublicEdit={isInstructor}
                />

                {editingId !== question._id && question._id && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPreviewId((prev) => (prev === question._id ? null : question._id || null))}
                    >
                      {previewId === question._id ? 'Hide Preview' : 'Preview'}
                    </button>

                    {canApproveQuestion(question) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyQuestionId === question._id}
                        onClick={() => handleToggleApprove(question)}
                      >
                        {question.approved ? 'Un-approve' : 'Approve'}
                      </button>
                    )}

                    {canTogglePublic(question) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyQuestionId === question._id}
                        onClick={() => handleTogglePublic(question)}
                      >
                        {question.public ? 'Hide from Public' : 'Make Public'}
                      </button>
                    )}

                    {canCopyQuestion(question) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyQuestionId === question._id}
                        onClick={() => handleCopyToLibrary(question._id || '')}
                      >
                        Copy to Library
                      </button>
                    )}
                  </div>
                )}

                {previewId === question._id && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <QuestionDisplay question={question} readonly forReview />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
