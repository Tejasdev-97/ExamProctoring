/**
 * ExamProctor.ai — Login Page
 * Serves admin, professor, and student login in a single branded form.
 */

import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Eye, EyeOff, ShieldCheck, Lock, User } from 'lucide-react';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Already logged in
  if (!loading && user) {
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'professor') return <Navigate to="/professor" replace />;
    return <Navigate to="/student" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please enter your credentials.');
      return;
    }
    setSubmitting(true);
    try {
      const u = await login(identifier.trim(), password);
      toast('Welcome back, ' + u.full_name + '!', 'success');
      if (u.role === 'admin') navigate('/admin');
      else if (u.role === 'professor') navigate('/professor');
      else navigate('/student');
    } catch (err) {
      const msg = err?.response?.data?.error?.message;
      if (err?.response?.status === 401) {
        setError('Incorrect credentials. Please check your USN / email and password.');
      } else if (err?.response?.status === 403) {
        setError('Your account is inactive. Contact your administrator.');
      } else {
        setError(msg || err?.message || 'Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Left panel — branding */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <ShieldCheck size={20} />
            <span>AI-Powered Proctoring</span>
          </div>
          <h1 className={styles.heroTitle}>
            ExamProctor<span>.ai</span>
          </h1>
          <p className={styles.heroSub}>
            Secure online exams with real-time monitoring and offline-capable continuity.
          </p>
          <div className={styles.featureList}>
            {[
              'Real-time exam monitoring',
              'Offline-ready exams and evidence recovery',
            ].map((f) => (
              <div key={f} className={styles.featureItem}>
                <span className={styles.featureDot} />
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.heroDecoration} aria-hidden="true" />
      </div>

      {/* Right panel — login form */}
      <div className={styles.formPanel}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <Link to="/" className={styles.logoLink} title="Back to Home">
              <img
                src="/examproctor.ai_logo.png"
                alt="ExamProctor.ai"
                className={styles.loginLogoImg}
              />
            </Link>
            <h2 className={styles.formTitle}>Sign in</h2>
            <p className={styles.formSub}>Enter your USN or email to continue.</p>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <Lock size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className="form-group">
              <label htmlFor="login-identifier" className="form-label">
                USN / Email address
              </label>
              <div className={styles.inputWrapper}>
                <User size={16} className={styles.inputIcon} />
                <input
                  id="login-identifier"
                  type="text"
                  className={`form-input ${styles.inputWithIcon}`}
                  placeholder="e.g. 2VD23MI001"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
              <div className={styles.inputWrapper}>
                <Lock size={16} className={styles.inputIcon} />
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  className={`form-input ${styles.inputWithIcon} ${styles.inputWithSuffix}`}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className={styles.disclaimer}>
            This platform records examination sessions for academic integrity purposes.
            By signing in, you acknowledge that your examination session may be monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
