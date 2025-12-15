import { useState, useEffect } from 'react';
import './MenstrualTracker.css';
import { computePhaseForDate } from '../utils/cycleUtils';

const MenstrualTracker = ({ cycleData, setCycleData, dayEntries, setDayEntries, userProfile, setUserProfile, onPeriodLogged, nextPeriodDate, daysUntilNext, isNextPeriodToday, monthlyLogs, prefillDate, predictedPhaseMap }) => {
  const [localData, setLocalData] = useState(cycleData || {
    lastPeriodDate: '', // period start date (kept for Dashboard compatibility)
    periodEndDate: '',
    cycleLength: 28,
    periodLength: 5,
  });

  const [cycleInfo, setCycleInfo] = useState({
    currentDay: 0,
    phase: '',
    nextPeriod: '',
    daysUntilNextPeriod: 0,
    symptoms: []
  });

  // per-day symptoms are handled in the per-day entry UI

  const symptomOptions = [
    'Cramps', 'Bloating', 'Mood Swings', 'Fatigue', 
    'Headache', 'Breast Tenderness', 'Acne', 'Back Pain',
    'Nausea', 'Food Cravings', 'Anxiety', 'Insomnia'
  ];

  // Calculate cycle phase using the shared utility so it mirrors calendar predictions
  const calculateCyclePhase = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const key = `${year}-${month}-${day}`;

    // Prefer the calendar's authoritative predictedPhaseMap when available
    if (predictedPhaseMap && predictedPhaseMap[key]) {
      const p = predictedPhaseMap[key];
      setCycleInfo({
        currentDay: p.dayInCycle || 0,
        phase: p.phaseLabel || '',
        nextPeriod: '',
        daysUntilNextPeriod: 0,
        symptoms: []
      });
      return;
    }

    // Fallback to computePhaseForDate logic
    const res = computePhaseForDate(today, monthlyLogs, localData);
    if (!res) {
      setCycleInfo({ currentDay: 0, phase: '', nextPeriod: '', daysUntilNextPeriod: 0, symptoms: [] });
      return;
    }

    const phaseLabelMap = { menstruation: 'Period', follicular: 'Follicular', ovulation: 'Ovulation', luteal: 'Luteal' };
    const phaseLabel = phaseLabelMap[res.phase] || '';

    // Compute next period date using cycleLen and dayInCycle
    const cycleLen = res.cycleLen || 28;
    const dayInCycle = res.dayInCycle || 1;
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const nextPeriodDate = new Date(todayStart);
    const daysUntil = Math.ceil((cycleLen - (dayInCycle - 1)));
    nextPeriodDate.setDate(nextPeriodDate.getDate() + daysUntil);

    setCycleInfo({
      currentDay: dayInCycle,
      phase: phaseLabel,
      nextPeriod: nextPeriodDate.toLocaleDateString(),
      daysUntilNextPeriod: daysUntil,
      symptoms: []
    });
  };

  useEffect(() => {
    calculateCyclePhase();
    // sync local data upwards when changed (include all date fields)
    if (setCycleData) setCycleData(localData);
    // Inform parent/dashboard about actual period logs when date is present
    if (onPeriodLogged && localData.lastPeriodDate) {
      onPeriodLogged(localData.lastPeriodDate, localData.periodEndDate || null);
    }
  }, [localData.lastPeriodDate, localData.periodEndDate, localData.cycleLength, localData.periodLength, setCycleData, monthlyLogs, predictedPhaseMap]);

  const handleStartDateChange = (e) => {
    setLocalData(prev => ({ ...prev, lastPeriodDate: e.target.value }));
  };

  const handleEndDateChange = (e) => {
    setLocalData(prev => ({ ...prev, periodEndDate: e.target.value }));
  };

  const handleCycleLengthChange = (e) => {
    setLocalData(prev => ({ ...prev, cycleLength: parseInt(e.target.value) }));
  };

  const handlePeriodLengthChange = (e) => {
    setLocalData(prev => ({ ...prev, periodLength: parseInt(e.target.value) }));
  };

  // tracker-level symptom UI removed; per-day symptoms remain

  const [entryDate, setEntryDate] = useState('');
  const [entryMood, setEntryMood] = useState('neutral');
  const [entrySymptoms, setEntrySymptoms] = useState([]);
  const [localProfile, setLocalProfile] = useState(userProfile || { height: '', weight: '', age: '' });

  const handleHeightChange = (e) => {
    setLocalProfile(prev => ({ ...prev, height: e.target.value }));
    if (setUserProfile) setUserProfile(prev => ({ ...prev, height: e.target.value }));
  };

  const handleWeightChange = (e) => {
    setLocalProfile(prev => ({ ...prev, weight: e.target.value }));
    if (setUserProfile) setUserProfile(prev => ({ ...prev, weight: e.target.value }));
  };

  const handleAgeChange = (e) => {
    setLocalProfile(prev => ({ ...prev, age: e.target.value }));
    if (setUserProfile) setUserProfile(prev => ({ ...prev, age: e.target.value }));
  };

  const handleAddEntry = () => {
    if (!entryDate) return;
    const key = entryDate;
    const newEntries = { ...(dayEntries || {}) };
    newEntries[key] = { mood: entryMood, symptoms: entrySymptoms };
    if (setDayEntries) setDayEntries(newEntries);
    setEntryDate(''); setEntryMood('neutral'); setEntrySymptoms([]);
  };

  // If parent requests prefill for a specific month, set the entry date to that prefill
  useEffect(() => {
    if (prefillDate) {
      setEntryDate(prefillDate);
    }
  }, [prefillDate]);

  const toggleEntrySymptom = (s) => {
    setEntrySymptoms(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s]);
  };

  const getPhaseColor = () => {
    switch (cycleInfo.phase) {
      case 'Period':
        return '#e85d75';
      case 'Follicular':
        return '#f8a855';
      case 'Ovulation':
        return '#ffd700';
      case 'Luteal':
        return '#b19cd9';
      default:
        return '#e8788';
    }
  };

  return (
    <div className="tracker-container">
      <div className="tracker-card">
        <h2 className="tracker-title">🩸 Menstrual Cycle Tracker</h2>
        
        <div className="tracker-form">
            <div className="form-group">
            <label>Period Start Date</label>
            <input
              type="date"
              value={localData.lastPeriodDate}
              onChange={handleStartDateChange}
              className="tracker-input"
            />
          </div>
          <div className="form-group">
            <label>Period End Date</label>
            <input
              type="date"
              value={localData.periodEndDate}
              onChange={handleEndDateChange}
              className="tracker-input"
            />
          
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cycle Length (days)</label>
              <input
                type="number"
                min="21"
                max="35"
                value={localData.cycleLength}
                onChange={handleCycleLengthChange}
                className="tracker-input"
              />
            </div>
            <div className="form-group">
              <label>Period Length (days)</label>
              <input
                type="number"
                min="1"
                max="14"
                value={localData.periodLength}
                onChange={handlePeriodLengthChange}
                className="tracker-input"
              />
            </div>
          </div>
        </div>

        {localData.lastPeriodDate && (
          <>
            <div className="cycle-info">
              <div className="info-card">
                <h3>Current Phase</h3>
                <div 
                  className="phase-badge" 
                  style={{ backgroundColor: getPhaseColor() }}
                >
                  {cycleInfo.phase}
                </div>
                <p className="phase-day">Day {cycleInfo.currentDay}</p>
              </div>

              <div className="info-card">
                <h3>Next Period</h3>
                <p className="next-period-date">{nextPeriodDate ? nextPeriodDate.toLocaleDateString() : cycleInfo.nextPeriod}</p>
                <p className="days-until">{typeof daysUntilNext === 'number' ? (isNextPeriodToday ? 'Today' : `${daysUntilNext} days away`) : `${cycleInfo.daysUntilNextPeriod} days away`}</p>
              </div>
            </div>

            {/* tracker-level symptom buttons removed; use per-day entries instead */}

            <div className="user-profile-section">
              <h3>👤 Your Profile (for AI Analysis)</h3>
              <p style={{fontSize: '13px', color: '#718096', marginBottom: '15px'}}>
                Enter your height, weight, and age to get more accurate health assessments in the Dataset & Analysis tab.
              </p>
              <div className="form-row profile-row">
                <div className="form-group profile-input">
                  <label>Height (cm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={localProfile?.height || ''}
                    onChange={handleHeightChange}
                    placeholder="e.g., 165"
                    className="tracker-input profile-field"
                  />
                </div>
                <div className="form-group profile-input">
                  <label>Weight (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={localProfile?.weight || ''}
                    onChange={handleWeightChange}
                    placeholder="e.g., 60"
                    className="tracker-input profile-field"
                  />
                </div>
                <div className="form-group profile-input">
                  <label>Age (years)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={localProfile?.age || ''}
                    onChange={handleAgeChange}
                    placeholder="e.g., 28"
                    className="tracker-input profile-field"
                  />
                </div>
              </div>
              {userProfile?.height && userProfile?.weight && (
                <div style={{marginTop: '10px', padding: '10px', background: '#f7fafc', borderRadius: '6px'}}>
                  <strong>Calculated BMI:</strong> {((Number(userProfile.weight) / Math.pow(Number(userProfile.height) / 100, 2))).toFixed(1)}
                </div>
              )}
            </div>

            <div className="per-day-entry">
              <h3>Add / Edit Day Entry</h3>
              <div className="month-summary">
                <strong>This month’s cycle summary</strong>
                <div style={{fontSize:13,color:'#64748b',marginTop:6}}>
                  {(() => {
                    const keyDate = entryDate || prefillDate || new Date().toISOString().slice(0,10);
                    const [y,m] = keyDate.split('-');
                    const monthKey = `${y}-${m}`;
                    const log = monthlyLogs?.[monthKey];
                    if (!log) return 'No monthly log for this month.';
                    if (log.isInitialCycle) {
                      // For initial cycle show only the user's entered actual dates (no predicted).
                      // Parse YYYY-MM-DD into local Date to avoid timezone shifts.
                      if (!log.actualStart) return 'Actual: Not logged yet';
                      const [sy, sm, sd] = log.actualStart.split('-').map(Number);
                      const s = new Date(sy, sm - 1, sd).toLocaleDateString();
                      if (!log.actualEnd) return `Actual: ${s}`;
                      const [ey, em, ed] = log.actualEnd.split('-').map(Number);
                      const e = new Date(ey, em - 1, ed).toLocaleDateString();
                      return `Actual: ${s} → ${e}`;
                    }
                    const pred = log.predictedStart ? `${new Date(log.predictedStart).toLocaleDateString()} → ${new Date(log.predictedEnd).toLocaleDateString()}` : 'Predicted: —';
                    const act = log.actualStart ? `${new Date(log.actualStart).toLocaleDateString()} → ${new Date(log.actualEnd).toLocaleDateString()}` : 'Actual: Not logged yet';
                    return `${pred} · ${act}`;
                  })()}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={entryDate} onChange={(e)=>setEntryDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Mood</label>
                  <select value={entryMood} onChange={(e)=>setEntryMood(e.target.value)}>
                    <option value="happy">Happy</option>
                    <option value="neutral">Neutral</option>
                    <option value="sad">Sad</option>
                    <option value="anxious">Anxious</option>
                    <option value="tired">Tired</option>
                  </select>
                </div>
              </div>
              <div className="symptoms-grid">
                {symptomOptions.map((symptom) => (
                  <button key={symptom} className={`symptom-btn ${entrySymptoms.includes(symptom)?'active':''}`} onClick={()=>toggleEntrySymptom(symptom)}>{symptom}</button>
                ))}
              </div>
              <div style={{marginTop:10}}>
                <button onClick={handleAddEntry} className="tracker-save-btn">Save Entry</button>
              </div>
            </div>

            <div className="entries-list">
              <h3>Month Entries</h3>
              <ul>
                {Object.keys(dayEntries || {}).length === 0 && <li>No entries yet.</li>}
                {Object.entries(dayEntries || {}).map(([date, info]) => (
                  <li key={date}>{date}: {info.mood} — {info.symptoms.join(', ')}</li>
                ))}
              </ul>
            </div>

            <div className="phase-info">
              <h3>About This Phase</h3>
              <p className="phase-description">
                {cycleInfo.phase === 'Period' && 
                  'Your body is shedding the uterine lining. Rest and stay hydrated.'}
                {cycleInfo.phase === 'Follicular' && 
                  'Estrogen is rising. You may feel more energetic and motivated.'}
                {cycleInfo.phase === 'Ovulation' && 
                  'Your most fertile days. You may experience increased energy and confidence.'}
                {cycleInfo.phase === 'Luteal' && 
                  'Progesterone is high. You may feel more introspective. Self-care is important.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MenstrualTracker;
