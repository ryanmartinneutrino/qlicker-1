# Component Migration Guide

This directory will contain React 18 components migrated from `imports/ui/` in the Meteor app.

## Migration Strategy

Each component in `imports/ui/` needs to be migrated following these steps:

1. **Remove Meteor dependencies**: Replace `withTracker`, `Meteor.subscribe`, `Meteor.call` etc.
2. **Use `useRealtimeCollection` hook**: For reactive data that was previously subscribed via DDP.
3. **Use `useApi` hook**: For one-off API calls that were previously `Meteor.call`.
4. **Convert class components to function components** using React hooks.
5. **Replace Iron Router navigation** with React Router's `useNavigate` and `Link`.

## Component Map (Current)

Feature parity is tracked at the workflow level, not strict 1:1 filename parity. Some legacy UI pieces were consolidated into page-level components.

| Old Meteor component (`imports/ui/`) | New component location |
|--------------------------------------|------------------------|
| `QuestionDisplay.jsx` | `components/QuestionDisplay.tsx` |
| `QuestionEditItem.jsx` | `components/QuestionEditItem.tsx` |
| `ResponseDisplay.jsx` | `components/ResponseDisplay.tsx` |
| `SessionDetails.jsx` | `components/SessionDetails.tsx` |
| `SessionListItem.jsx` | `components/SessionListItem.tsx` |
| `CourseListItem.jsx` | `components/CourseListItem.tsx` |
| `Histogram.jsx` | `components/Histogram.tsx` |
| `Editor.jsx` | `components/Editor.tsx` |
| `AnswerDistribution.jsx` | `components/AnswerDistribution.tsx` |
| `QuestionSidebar.jsx` | `components/QuestionSidebar.tsx` |
| `ResponseList.jsx` | `components/ResponseList.tsx` |
| `ShortAnswerList.jsx` | `components/ShortAnswerList.tsx` |
| `modals/CreateSessionModal.jsx` | `components/modals/CreateSessionModal.tsx` |
| `modals/CreateQuestionModal.jsx` | `components/modals/CreateQuestionModal.tsx` |
| `modals/ChangeEmailModal.jsx` | `components/modals/ChangeEmailModal.tsx` |
| `modals/ChangePasswordModal.jsx` | `components/modals/ChangePasswordModal.tsx` |
| `modals/EnrollCourseModal.jsx` | `components/modals/EnrollCourseModal.tsx` |
| `modals/QuizExtensionsModal.jsx` | `components/modals/QuizExtensionsModal.tsx` |

Consolidated/inline examples:
- legacy roster modals (`AddStudentModal`, `AddTAModal`) are now inline controls in `pages/Course.tsx`
- legacy wrapper/table components (`CleanPageContainer`, `Clean*Table`) were replaced by React Router + page-local render logic

## Key Pattern Changes

### Before (Meteor + withTracker)
```jsx
export default withTracker(({ sessionId }) => {
  Meteor.subscribe('sessions.single', sessionId)
  return { session: Sessions.findOne({ _id: sessionId }) }
})(MyComponent)
```

### After (React 18 + hooks)
```tsx
function MyComponent({ sessionId }: { sessionId: string }) {
  const { data: sessions, loading } = useRealtimeCollection({
    fetchPath: `/sessions/${sessionId}`,
    subscribeEvent: 'subscribe:session',
    subscribePayload: { sessionId },
    changeEvent: 'session:change',
  })
  const session = sessions[0]
  // ...
}
```
