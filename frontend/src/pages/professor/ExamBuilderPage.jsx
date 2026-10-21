/**
 * ExamProctor.ai — Exam Builder Page (5-step wizard)
 * Steps: Details → Questions → Import → Proctoring → Publish
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ExamDetailsStep from './builder/ExamDetailsStep';
import QuestionsStep from './builder/QuestionsStep';
import ProctoringStep from './builder/ProctoringStep';
import PublishStep from './builder/PublishStep';
import styles from './ExamBuilderPage.module.css';

const STEPS = [
  { id: 'details',    label: 'Details' },
  { id: 'questions',  label: 'Questions' },
  { id: 'proctoring', label: 'Proctoring' },
  { id: 'publish',    label: 'Publish' },
];

export default function ExamBuilderPage() {
  const { examId } = useParams();
  const navigate   = useNavigate();
  const toast      = useToast();
  const isEdit     = !!examId;

  const [stepIndex, setStepIndex]   = useState(0);
  const [exam, setExam]             = useState(null);
  const [loading, setLoading]       = useState(!!isEdit);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/exams/${examId}`)
      .then(({ data }) => setExam(data.data))
      .catch(() => toast('Could not load exam.', 'error'))
      .finally(() => setLoading(false));
  }, [examId, isEdit, toast]);

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goPrev = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleExamSaved = (savedExam) => {
    setExam(savedExam);
    goNext();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {isEdit ? 'Edit Examination' : 'Create Examination'}
        </h1>
        {exam && (
          <span className="badge badge-blue">{exam.title}</span>
        )}
      </div>

      {/* Step indicator */}
      <div className={styles.stepper} role="navigation" aria-label="Exam builder steps">
        {STEPS.map((step, i) => {
          const isDone    = i < stepIndex;
          const isCurrent = i === stepIndex;
          return (
            <div key={step.id} className={styles.stepItem}>
              <button
                className={`${styles.stepCircle}
                  ${isDone ? styles.stepDone : ''}
                  ${isCurrent ? styles.stepCurrent : ''}`}
                onClick={() => exam && setStepIndex(i)}
                disabled={!exam && i > 0}
                aria-label={`Step ${i + 1}: ${step.label}`}
                aria-current={isCurrent ? 'step' : undefined}
                id={`btn-step-${step.id}`}
              >
                {isDone ? <Check size={14} /> : i + 1}
              </button>
              <span className={`${styles.stepLabel} ${isCurrent ? styles.stepLabelCurrent : ''}`}>
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRight size={16} className={styles.stepArrow} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className={styles.stepContent}>
        {stepIndex === 0 && (
          <ExamDetailsStep
            exam={exam}
            onSaved={handleExamSaved}
          />
        )}
        {stepIndex === 1 && exam && (
          <QuestionsStep
            exam={exam}
            onNext={goNext}
            onBack={goPrev}
          />
        )}
        {stepIndex === 2 && exam && (
          <ProctoringStep
            exam={exam}
            onSaved={(updated) => { setExam(updated); goNext(); }}
            onBack={goPrev}
          />
        )}
        {stepIndex === 3 && exam && (
          <PublishStep
            exam={exam}
            onPublished={(updated) => {
              setExam(updated);
              toast('Exam published successfully!', 'success');
              navigate('/professor');
            }}
            onBack={goPrev}
          />
        )}
      </div>
    </div>
  );
}
