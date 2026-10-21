/**
 * ExamProctor.ai — Exam Session Layout
 * Full-page layout (no sidebar) used during active exams.
 */

import { Outlet } from 'react-router-dom';

export default function ExamLayout() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-page-bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Outlet />
    </div>
  );
}
