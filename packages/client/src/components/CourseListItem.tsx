import type { Course } from '@qlicker/shared'

interface ControlAction {
  label: string
  click: () => void
}

interface CourseListItemProps {
  course: Course
  click?: () => void
  controls?: ControlAction[]
  inactive?: boolean
  isTA?: boolean
}

export function CourseListItem({ course, click, controls, inactive, isTA }: CourseListItemProps) {
  const className = inactive
    ? 'ql-course-list-item-inactive ql-list-item'
    : 'ql-course-list-item ql-list-item'

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()

  return (
    <div className={`${className}${click ? ' click' : ''}`} onClick={click}>
      {isTA && <div>(TA)</div>}
      <span className="ql-course-code">{courseCode} </span>
      <span className="ql-course-name">{course.name}</span>
      <span className="ql-course-semester">{course.semester}</span>
      {controls && controls.length > 0 && (
        <span className="controls">
          {controls.map((action) => (
            <a
              key={action.label}
              href="#"
              className="toolbar-button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                action.click()
              }}
            >
              {action.label}
            </a>
          ))}
        </span>
      )}
    </div>
  )
}
