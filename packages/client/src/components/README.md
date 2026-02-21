# Component Migration Guide

This directory will contain React 18 components migrated from `imports/ui/` in the Meteor app.

## Migration Strategy

Each component in `imports/ui/` needs to be migrated following these steps:

1. **Remove Meteor dependencies**: Replace `withTracker`, `Meteor.subscribe`, `Meteor.call` etc.
2. **Use `useRealtimeCollection` hook**: For reactive data that was previously subscribed via DDP.
3. **Use `useApi` hook**: For one-off API calls that were previously `Meteor.call`.
4. **Convert class components to function components** using React hooks.
5. **Replace Iron Router navigation** with React Router's `useNavigate` and `Link`.

## Component Map

| Old Meteor component (`imports/ui/`) | New component location |
|--------------------------------------|------------------------|
| `LoginBox.jsx` | `components/LoginBox.tsx` |
| `QuestionDisplay.jsx` | `components/QuestionDisplay.tsx` |
| `QuestionEditItem.jsx` | `components/QuestionEditItem.tsx` |
| `ResponseDisplay.jsx` | `components/ResponseDisplay.tsx` |
| `SessionDetails.jsx` | `components/SessionDetails.tsx` |
| `SessionListItem.jsx` | `components/SessionListItem.tsx` |
| `CourseListItem.jsx` | `components/CourseListItem.tsx` |
| `GradeView.jsx` | `components/GradeView.tsx` |
| `Histogram.jsx` | `components/Histogram.tsx` |
| `Editor.jsx` | `components/Editor.tsx` |
| `ManageUsers.jsx` | `components/ManageUsers.tsx` |
| `ProfileCard.jsx` | `components/ProfileCard.tsx` |
| `QuizSession.jsx` | `components/QuizSession.tsx` |
| All modals (`imports/ui/modals/`) | `components/modals/` |

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
