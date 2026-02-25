import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { Course as CourseType, GroupCategory, Group } from '@qlicker/shared'
import { apiClient } from '../api/client'
import { downloadCsvFile } from '../utils/csv'

interface ManagedStudent {
  _id: string
  firstname: string
  lastname: string
  email: string
}

interface GroupManagementPayload {
  courseId: string
  groupCategories: GroupCategory[]
  students: ManagedStudent[]
}

function categoryLabel(category: GroupCategory): string {
  const number = Number(category.categoryNumber || 0)
  const name = category.categoryName || `Category ${number}`
  const count = (category.groups || []).length
  return `${name} (${count} group${count === 1 ? '' : 's'})`
}

function groupLabel(group: Group): string {
  const number = Number(group.groupNumber || 0)
  const name = group.groupName || `Group ${number}`
  const count = (group.students || []).length
  return `${name} (${count} member${count === 1 ? '' : 's'})`
}

function studentDisplayName(student: ManagedStudent): string {
  return `${student.lastname}, ${student.firstname}`.trim().replace(/^,\s*/, '')
}

export default function ManageCourseGroups() {
  const { courseId } = useParams<{ courseId: string }>()

  const [course, setCourse] = useState<CourseType | null>(null)
  const [categories, setCategories] = useState<GroupCategory[]>([])
  const [students, setStudents] = useState<ManagedStudent[]>([])
  const [selectedCategoryNumber, setSelectedCategoryNumber] = useState<number | null>(null)
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryGroups, setNewCategoryGroups] = useState('1')
  const [newGroupName, setNewGroupName] = useState('')
  const [showUngroupedStudents, setShowUngroupedStudents] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => categories.find((category) => Number(category.categoryNumber) === selectedCategoryNumber) || null,
    [categories, selectedCategoryNumber]
  )

  const selectedGroup = useMemo(
    () =>
      (selectedCategory?.groups || []).find(
        (group) => Number(group.groupNumber) === selectedGroupNumber
      ) || null,
    [selectedCategory, selectedGroupNumber]
  )

  const load = async () => {
    if (!courseId) return
    setLoading(true)
    setError(null)
    try {
      const [courseDoc, manageDoc] = await Promise.all([
        apiClient.get<CourseType>(`/courses/${courseId}`),
        apiClient.get<GroupManagementPayload>(`/courses/${courseId}/groups/manage`),
      ])
      setCourse(courseDoc)
      setCategories(manageDoc.groupCategories || [])
      setStudents(manageDoc.students || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategoryNumber(null)
      setSelectedGroupNumber(null)
      return
    }

    const hasSelectedCategory = categories.some(
      (category) => Number(category.categoryNumber) === selectedCategoryNumber
    )
    if (!hasSelectedCategory) {
      const firstCategoryNumber = Number(categories[0].categoryNumber || 0)
      setSelectedCategoryNumber(firstCategoryNumber)
      const firstGroupNumber = Number(categories[0].groups?.[0]?.groupNumber || 0)
      setSelectedGroupNumber(firstGroupNumber || null)
      return
    }

    const category = categories.find((entry) => Number(entry.categoryNumber) === selectedCategoryNumber)
    const groups = category?.groups || []
    if (groups.length === 0) {
      setSelectedGroupNumber(null)
      return
    }

    const hasSelectedGroup = groups.some((group) => Number(group.groupNumber) === selectedGroupNumber)
    if (!hasSelectedGroup) {
      setSelectedGroupNumber(Number(groups[0].groupNumber || 0))
    }
  }, [categories, selectedCategoryNumber, selectedGroupNumber])

  useEffect(() => {
    if (!selectedGroup) {
      setNewGroupName('')
      return
    }
    setNewGroupName(selectedGroup.groupName || `Group ${selectedGroup.groupNumber}`)
  }, [selectedGroup?.groupNumber, selectedGroup?.groupName])

  const applyCategoryUpdate = (nextCategories: GroupCategory[]) => {
    setCategories(nextCategories)
  }

  const runMutation = async (task: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const addCategoryOrGroups = async () => {
    if (!courseId) return
    const categoryName = newCategoryName.trim()
    if (!categoryName) return

    await runMutation(async () => {
      const nGroups = Math.max(1, Number.parseInt(newCategoryGroups, 10) || 1)
      const updated = await apiClient.post<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories`,
        { categoryName, nGroups }
      )
      applyCategoryUpdate(updated.groupCategories || [])
      setNewCategoryName('')
      setNewCategoryGroups('1')
    })
  }

  const addGroup = async () => {
    if (!courseId || !selectedCategoryNumber) return

    await runMutation(async () => {
      const updated = await apiClient.post<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories/${selectedCategoryNumber}/groups`,
        { nGroups: 1 }
      )
      applyCategoryUpdate(updated.groupCategories || [])
    })
  }

  const deleteCategory = async () => {
    if (!courseId || !selectedCategoryNumber) return
    if (!window.confirm('Delete this category and all related groups?')) return

    await runMutation(async () => {
      const updated = await apiClient.delete<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories/${selectedCategoryNumber}`
      )
      applyCategoryUpdate(updated.groupCategories || [])
    })
  }

  const saveGroupName = async () => {
    if (!courseId || !selectedCategoryNumber || !selectedGroupNumber) return
    const groupName = newGroupName.trim()
    if (!groupName) return

    await runMutation(async () => {
      const updated = await apiClient.patch<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories/${selectedCategoryNumber}/groups/${selectedGroupNumber}`,
        { groupName }
      )
      applyCategoryUpdate(updated.groupCategories || [])
    })
  }

  const deleteGroup = async () => {
    if (!courseId || !selectedCategoryNumber || !selectedGroupNumber) return
    if (!window.confirm('Delete the selected group?')) return

    await runMutation(async () => {
      const updated = await apiClient.delete<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories/${selectedCategoryNumber}/groups/${selectedGroupNumber}`
      )
      applyCategoryUpdate(updated.groupCategories || [])
    })
  }

  const toggleStudentInSelectedGroup = async (studentId: string) => {
    if (!courseId || !selectedCategoryNumber || !selectedGroupNumber) return

    await runMutation(async () => {
      const updated = await apiClient.post<{ groupCategories: GroupCategory[] }>(
        `/courses/${courseId}/groups/categories/${selectedCategoryNumber}/groups/${selectedGroupNumber}/students/${studentId}/toggle`,
        {}
      )
      applyCategoryUpdate(updated.groupCategories || [])
    })
  }

  const setGroupFromStudent = (studentId: string) => {
    if (!selectedCategory) return
    const found = (selectedCategory.groups || []).find((group) =>
      (group.students || []).includes(studentId)
    )
    if (found?.groupNumber) {
      setSelectedGroupNumber(Number(found.groupNumber))
    }
  }

  const downloadCsv = () => {
    const rows: Array<Array<unknown>> = [
      ['CategoryName', 'CategoryNumber', 'GroupName', 'GroupNumber', 'Email', 'LastName', 'FirstName'],
    ]

    const studentById = new Map(students.map((student) => [student._id, student]))

    categories.forEach((category) => {
      ;(category.groups || []).forEach((group) => {
        ;(group.students || []).forEach((studentId) => {
          const student = studentById.get(studentId)
          if (!student) return
          const values = [
            category.categoryName || '',
            String(category.categoryNumber || ''),
            group.groupName || '',
            String(group.groupNumber || ''),
            student.email,
            student.lastname,
            student.firstname,
          ]
          rows.push(values)
        })
      })
    })

    downloadCsvFile('groups.csv', rows)
  }

  const studentsInCategory = useMemo(() => {
    if (!selectedCategory) return new Set<string>()
    const ids = new Set<string>()
    ;(selectedCategory.groups || []).forEach((group) => {
      ;(group.students || []).forEach((studentId) => {
        ids.add(studentId)
      })
    })
    return ids
  }, [selectedCategory])

  const studentsInGroup = useMemo(() => {
    if (!selectedGroup) return [] as ManagedStudent[]
    const selectedIds = new Set(selectedGroup.students || [])
    return students
      .filter((student) => selectedIds.has(student._id))
      .sort((a, b) => {
        const byLast = a.lastname.localeCompare(b.lastname)
        if (byLast !== 0) return byLast
        return a.firstname.localeCompare(b.firstname)
      })
  }, [selectedGroup, students])

  const studentsToShow = useMemo(() => {
    let list = students

    if (selectedCategory) {
      if (showUngroupedStudents) {
        list = students.filter((student) => !studentsInCategory.has(student._id))
      } else {
        list = students.filter((student) => studentsInCategory.has(student._id))
      }
    }

    const query = studentSearch.trim().toLowerCase()
    if (query) {
      list = list.filter((student) => {
        const fullName = `${student.firstname} ${student.lastname}`.toLowerCase()
        return (
          fullName.includes(query) ||
          student.firstname.toLowerCase().includes(query) ||
          student.lastname.toLowerCase().includes(query) ||
          student.email.toLowerCase().includes(query)
        )
      })
    }

    return [...list].sort((a, b) => {
      const byLast = a.lastname.localeCompare(b.lastname)
      if (byLast !== 0) return byLast
      return a.firstname.localeCompare(b.firstname)
    })
  }, [selectedCategory, showUngroupedStudents, studentsInCategory, students, studentSearch])

  if (loading) return <div className="page">Loading...</div>
  if (error && !course) return <div className="page">Error: {error}</div>
  if (!course) return <div className="page">Course not found</div>

  const courseCode = `${course.deptCode} ${course.courseNumber}-${course.section}`.toUpperCase()

  return (
    <div className="page">
      <div className="ql-header-bar">
        <h1>Groups: {courseCode}</h1>
      </div>

      <div className="container">
        <Link className="btn btn-secondary" to={`/course/${courseId}`} style={{ marginBottom: '1rem', display: 'inline-block' }}>
          Back to Course
        </Link>

        {error && <div className="ql-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <div className="row">
          <div className="col-md-4">
            <div className="ql-card">
              <div className="ql-header-bar"><h4>Categories</h4></div>
              <div className="ql-card-content">
                {categories.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <button className="btn btn-default" onClick={downloadCsv} disabled={saving}>
                      Download Group CSV
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    disabled={saving}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ margin: 0 }}>Groups:</label>
                    <input
                      type="number"
                      min={1}
                      className="form-control"
                      style={{ maxWidth: 90 }}
                      value={newCategoryGroups}
                      onChange={(event) => setNewCategoryGroups(event.target.value)}
                      disabled={saving}
                    />
                    <button className="btn btn-default" onClick={() => void addCategoryOrGroups()} disabled={saving || !newCategoryName.trim()}>
                      Create/Add
                    </button>
                  </div>
                </div>

                {categories.length > 0 ? (
                  <>
                    <label htmlFor="category-select">Category</label>
                    <select
                      id="category-select"
                      className="form-control"
                      value={selectedCategoryNumber || ''}
                      onChange={(event) => setSelectedCategoryNumber(Number(event.target.value))}
                      disabled={saving}
                    >
                      {categories.map((category) => (
                        <option key={category.categoryNumber} value={category.categoryNumber}>
                          {categoryLabel(category)}
                        </option>
                      ))}
                    </select>

                    <label htmlFor="group-select" style={{ marginTop: '0.75rem' }}>Group</label>
                    <select
                      id="group-select"
                      className="form-control"
                      value={selectedGroupNumber || ''}
                      onChange={(event) => setSelectedGroupNumber(Number(event.target.value))}
                      disabled={saving || !selectedCategory || (selectedCategory.groups || []).length < 1}
                    >
                      {(selectedCategory?.groups || []).map((group) => (
                        <option key={group.groupNumber} value={group.groupNumber}>
                          {groupLabel(group)}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-default" onClick={() => void addGroup()} disabled={saving || !selectedCategory}>
                        Add Group
                      </button>
                      <button className="btn btn-default" onClick={() => void deleteCategory()} disabled={saving || !selectedCategory}>
                        Delete Category
                      </button>
                    </div>
                  </>
                ) : (
                  <p>No categories created yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="ql-card">
              <div className="ql-header-bar"><h4>Group Membership</h4></div>
              <div className="ql-card-content">
                {!selectedGroup ? (
                  <p>Select a category and group.</p>
                ) : (
                  <>
                    <div style={{ marginBottom: '0.5rem', display: 'grid', gap: '0.4rem' }}>
                      <label htmlFor="group-name-input">Group name</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          id="group-name-input"
                          type="text"
                          className="form-control"
                          value={newGroupName}
                          onChange={(event) => setNewGroupName(event.target.value)}
                          disabled={saving}
                        />
                        <button className="btn btn-default" onClick={() => void saveGroupName()} disabled={saving || !newGroupName.trim()}>
                          Save
                        </button>
                      </div>
                    </div>

                    <button
                      className="btn btn-default"
                      onClick={() => void deleteGroup()}
                      disabled={saving || (selectedCategory?.groups || []).length < 2}
                      style={{ marginBottom: '0.75rem' }}
                    >
                      Delete Group
                    </button>

                    <div className="ql-simple-studentlist">
                      <div className="ql-simple-studentlist-info">
                        ({studentsInGroup.length} student{studentsInGroup.length === 1 ? '' : 's'})
                        {studentsInGroup.length > 0 && <><br />(click to remove from this group)</>}
                      </div>
                      <div className="ql-simple-studentlist-student-container">
                        {studentsInGroup.map((student) => (
                          <div
                            key={student._id}
                            className="ql-simple-studentlist-student"
                            onClick={() => void toggleStudentInSelectedGroup(student._id)}
                          >
                            {studentDisplayName(student)} ({student.email})
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="ql-card">
              <div className="ql-header-bar"><h4>Students</h4></div>
              <div className="ql-card-content">
                {selectedCategory && (
                  <button
                    className="btn btn-default"
                    style={{ marginBottom: '0.6rem' }}
                    onClick={() => setShowUngroupedStudents((value) => !value)}
                    disabled={saving}
                  >
                    {showUngroupedStudents ? 'Show students in category' : 'Show students not in category'}
                  </button>
                )}

                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name or email"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  style={{ marginBottom: '0.6rem' }}
                />

                <div className="ql-simple-studentlist">
                  <div className="ql-simple-studentlist-info">
                    {selectedCategory
                      ? showUngroupedStudents
                        ? `Students not in ${selectedCategory.categoryName || 'category'}`
                        : `Students in ${selectedCategory.categoryName || 'category'}`
                      : 'All students'}
                    {' '}
                    ({studentsToShow.length} student{studentsToShow.length === 1 ? '' : 's'})
                    {selectedGroup && selectedCategory && showUngroupedStudents && (
                      <><br />(click to add to selected group)</>
                    )}
                  </div>
                  <div className="ql-simple-studentlist-student-container">
                    {studentsToShow.map((student) => (
                      <div
                        key={student._id}
                        className="ql-simple-studentlist-student"
                        onClick={() => {
                          if (selectedGroup && selectedCategory && showUngroupedStudents) {
                            void toggleStudentInSelectedGroup(student._id)
                            return
                          }
                          if (selectedCategory) {
                            setGroupFromStudent(student._id)
                          }
                        }}
                      >
                        {studentDisplayName(student)} ({student.email})
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
