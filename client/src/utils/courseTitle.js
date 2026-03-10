function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

export function buildCourseTitle(course = {}, variant = 'long') {
  const name = toText(course?.name);
  const deptCode = toText(course?.deptCode);
  const courseNumber = toText(course?.courseNumber);
  const semester = toText(course?.semester);

  const code = `${deptCode} ${courseNumber}`.trim();
  const shortTitle = code || name || 'Course';
  const mediumTitle = code && name ? `${code}: ${name}` : (name || code || 'Course');
  const longTitle = semester ? `${mediumTitle} (${semester})` : mediumTitle;

  if (variant === 'short') return shortTitle;
  if (variant === 'medium') return mediumTitle;
  return longTitle;
}
