/**
 * ExamProctor.ai — Admin Dashboard
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Settings, ShieldCheck, BookOpen, ArrowRight } from 'lucide-react';
import api from '../../services/api';
import styles from './AdminDashboard.module.css';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, exams: 0, attempts: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/users').catch(() => ({ data: { data: [] } })),
      api.get('/exams').catch(() => ({ data: { data: [] } })),
    ]).then(([usersRes, examsRes]) => {
      setStats({
        users: usersRes.data.data?.length || 0,
        exams: examsRes.data.data?.length || 0,
        attempts: 0,
      });
    });
  }, []);

  const tiles = [
    {
      title: 'User Management',
      desc: 'Create, activate, deactivate, and manage roles for all users.',
      icon: Users,
      route: '/admin/users',
      color: 'var(--color-blue)',
      shadow: 'var(--shadow-blue)',
      stat: `${stats.users} users`,
    },
    {
      title: 'System Settings',
      desc: 'Configure global proctoring thresholds and platform behaviour.',
      icon: Settings,
      route: '/admin/settings',
      color: 'var(--color-orange)',
      shadow: 'var(--shadow-orange)',
      stat: null,
    },
    {
      title: 'Audit Log',
      desc: 'Browse tamper-evident records of all system actions.',
      icon: ShieldCheck,
      route: '/admin/audit',
      color: 'var(--color-green)',
      shadow: '4px 4px 0 var(--color-green)',
      stat: null,
    },
    {
      title: 'All Examinations',
      desc: 'View every exam across all professors on the platform.',
      icon: BookOpen,
      route: '/professor',
      color: 'var(--color-blue-deep)',
      shadow: '4px 4px 0 var(--color-blue-deep)',
      stat: `${stats.exams} exams`,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          Admin Dashboard
        </h1>
        <p className={styles.subtitle}>
          ExamProctor.ai Platform Administration
        </p>
      </div>

      <div className={styles.grid}>
        {tiles.map(({ title, desc, icon: Icon, route, color, shadow, stat }) => (
          <button
            key={route}
            id={`btn-admin-${title.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => navigate(route)}
            className={styles.tile}
            style={{
              '--tile-accent': color,
              '--tile-shadow': shadow,
            }}
          >
            <div className={styles.iconBox} style={{ background: color }}>
              <Icon size={24} color="#fff" strokeWidth={2.2} />
            </div>

            <div className={styles.tileContent}>
              <div className={styles.tileTitle}>
                {title}
              </div>

              <div className={styles.tileDesc}>
                {desc}
              </div>

              {stat && (
                <div className={styles.tileStat}>
                  {stat}
                </div>
              )}
            </div>

            <div className={styles.arrowBox} aria-hidden="true">
              <ArrowRight size={20} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
