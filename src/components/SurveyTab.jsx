import { useState } from 'react';
import './SurveyTab.css';

const QUESTIONS = [
  { id: 'last_period', text: 'When was your last period? (YYYY-MM-DD)', type: 'text' },
  { id: 'cycle_length', text: 'How long is your cycle on average? (days)', type: 'number' },
  { id: 'regularity', text: 'Is your cycle regular or irregular?', type: 'select', options: ['regular', 'irregular'] },
  { id: 'bleed_days', text: 'How many days do you bleed?', type: 'number' },

  { id: 'pms_severity', text: 'Do you experience severe PMS?', type: 'select', options: ['no', 'mild', 'moderate', 'severe'] },
  { id: 'mood_swings', text: 'Do you have mood swings?', type: 'select', options: ['no', 'yes'] },
  { id: 'acne', text: 'Any recent acne breakout?', type: 'select', options: ['no', 'yes'] },
  { id: 'fatigue', text: 'Do you feel unusual fatigue?', type: 'select', options: ['no', 'yes'] },

  { id: 'sleep_hours', text: 'How many hours do you sleep per night?', type: 'number' },
  { id: 'exercise', text: 'How often do you exercise?', type: 'select', options: ['daily', 'few times/week', 'rarely', 'never'] },
  { id: 'stress', text: 'How would you rate your stress level?', type: 'select', options: ['low', 'medium', 'high'] }
];

const encodeAnswers = (a) => {
  const cycle_length = Number(a.cycle_length) || 28;
  const regularity = (a.regularity === 'regular') ? 1 : 0;
  const pms_map = { no: 0, mild: 3, moderate: 5, severe: 8 };
  const pms_severity = pms_map[a.pms_severity] ?? 0;
  const stress_map = { low: 1, medium: 2, high: 3 };
  const stress = stress_map[a.stress] ?? 1;
  const sleep_hours = Number(a.sleep_hours) || 7;
  const exercise_map = { 'daily': 3, 'few times/week': 2, 'rarely': 1, 'never': 0 };
  const exercise = exercise_map[a.exercise] ?? 0;
  const acne = (a.acne === 'yes') ? 1 : 0;
  // vector: [cycle_length, regularity, pms_severity, stress, sleep_hours, exercise, acne]
  return [cycle_length, regularity, pms_severity, stress, sleep_hours, exercise, acne];
};

const simplePredict = (vec, answers) => {
  const [cycle_length, regularity, pms_severity, stress, sleep_hours, exercise, acne] = vec;

  // Simple heuristic rules (indicative only)
  if (regularity === 0 && cycle_length >= 35 && acne === 1) {
    return 'Possible PCOS pattern';
  }
  if (pms_severity >= 6 && (sleep_hours <= 6 || stress >= 3)) {
    return 'Possible estrogen dominance';
  }
  if (sleep_hours <= 5 && stress >= 3 && fatigueIsYes(answers)) {
    return 'Possible thyroid-related pattern';
  }
  if (acne === 1 && cycle_length <= 28) {
    return 'Possible androgen imbalance';
  }
  return 'Pattern within common variability';
};

const fatigueIsYes = (answers) => answers.fatigue === 'yes';

const SurveyTab = ({ onComplete, existingResult = null, onReset }) => {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);

  // If an existingResult is provided, the survey is considered locked until the user retakes it
  const locked = !!existingResult;

  const current = QUESTIONS[index];

  const handleChange = (e) => {
    const value = e.target.value;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  };

  const handleNext = () => {
    // if no answer, do nothing
    if (current && (answers[current.id] === undefined || answers[current.id] === '')) return;

    if (index < QUESTIONS.length - 1) {
      setIndex(index + 1);
    } else {
      // finish
      const vector = encodeAnswers(answers);
      const prediction = simplePredict(vector, answers);
      const results = { answers, vector, prediction, timestamp: new Date().toISOString() };
      setFinished(true);
      if (typeof onComplete === 'function') onComplete(results);
    }
  };

  const handlePrev = () => {
    if (index > 0) setIndex(index - 1);
  };
  // Build content explicitly to avoid nested ternary JSX issues
  let surveyContent = null;
  if (locked) {
    surveyContent = (
      <div className="survey-locked">
        <p>You've already completed this survey.</p>
        <div className="survey-locked-actions">
          <button className="btn small secondary retake-btn" onClick={() => {
            const ok = window.confirm('Retaking will reset your previous answers. Continue?');
            if (ok) {
              if (typeof onReset === 'function') onReset();
              setAnswers({}); setIndex(0); setFinished(false);
            }
          }}>
            <span className="retake-icon">🔄</span>
            <span>Retake survey</span>
          </button>
        </div>
      </div>
    );
  } else if (!finished) {
    surveyContent = (
      <div className="question-area">
        <p className="question-count">Question {index + 1} of {QUESTIONS.length}</p>
        <p className="question-text">{current.text}</p>

        {current.type === 'text' && (
          <input type="text" value={answers[current.id] || ''} onChange={handleChange} />
        )}

        {current.type === 'number' && (
          <input type="number" value={answers[current.id] || ''} onChange={handleChange} />
        )}

        {current.type === 'select' && (
          <div className="options">
            {current.options.map((opt) => (
              <label key={opt} className="option-label">
                <input
                  type="radio"
                  name={current.id}
                  value={opt}
                  checked={answers[current.id] === opt}
                  onChange={handleChange}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}

        <div className="survey-actions">
          <button onClick={handlePrev} disabled={index === 0}>Back</button>
          <button onClick={handleNext}>{index === QUESTIONS.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    );
  } else {
    surveyContent = (
      <div className="results-area">
        <h3>Thanks — here is a short summary</h3>
        <p><strong>Pattern:</strong> {simplePredict(encodeAnswers(answers), answers)}</p>
        <p className="results-note">This is an indicative pattern only and not a medical diagnosis. Consider tracking for a few cycles and consult a healthcare professional if concerns persist.</p>
      </div>
    );
  }

  return (
    <div className="survey-tab">
      <h2>Menstrual Health Survey</h2>
      {surveyContent}
    </div>
  );
};

export default SurveyTab;
