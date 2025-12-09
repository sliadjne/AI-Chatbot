import { useState, useEffect } from 'react';
import './MenstrualTracker.css';

const MenstrualTracker = () => {
  const [cycleData, setCycleData] = useState({
    lastPeriodDate: '',
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

  const [symptoms, setSymptoms] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);

  const symptomOptions = [
    'Cramps', 'Bloating', 'Mood Swings', 'Fatigue', 
    'Headache', 'Breast Tenderness', 'Acne', 'Back Pain',
    'Nausea', 'Food Cravings', 'Anxiety', 'Insomnia'
  ];

  // Calculate cycle phase based on date
  const calculateCyclePhase = () => {
    if (!cycleData.lastPeriodDate) return;

    const lastPeriod = new Date(cycleData.lastPeriodDate);
    const today = new Date();
    const daysSinceLastPeriod = Math.floor((today - lastPeriod) / (1000 * 60 * 60 * 24));
    const dayInCycle = daysSinceLastPeriod % cycleData.cycleLength;
    const nextPeriodDate = new Date(lastPeriod);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleData.cycleLength);
    const daysUntil = Math.ceil((nextPeriodDate - today) / (1000 * 60 * 60 * 24));

    let phase = '';
    if (dayInCycle < cycleData.periodLength) {
      phase = 'Menstruation';
    } else if (dayInCycle < cycleData.cycleLength * 0.33) {
      phase = 'Follicular';
    } else if (dayInCycle < cycleData.cycleLength * 0.46) {
      phase = 'Ovulation';
    } else {
      phase = 'Luteal';
    }

    setCycleInfo({
      currentDay: dayInCycle + 1,
      phase,
      nextPeriod: nextPeriodDate.toLocaleDateString(),
      daysUntilNextPeriod: daysUntil,
      symptoms: selectedSymptoms
    });
  };

  useEffect(() => {
    calculateCyclePhase();
  }, [cycleData.lastPeriodDate, cycleData.cycleLength, cycleData.periodLength, selectedSymptoms]);

  const handleDateChange = (e) => {
    setCycleData(prev => ({
      ...prev,
      lastPeriodDate: e.target.value
    }));
  };

  const handleCycleLengthChange = (e) => {
    setCycleData(prev => ({
      ...prev,
      cycleLength: parseInt(e.target.value)
    }));
  };

  const handlePeriodLengthChange = (e) => {
    setCycleData(prev => ({
      ...prev,
      periodLength: parseInt(e.target.value)
    }));
  };

  const toggleSymptom = (symptom) => {
    setSelectedSymptoms(prev =>
      prev.includes(symptom)
        ? prev.filter(s => s !== symptom)
        : [...prev, symptom]
    );
  };

  const getPhaseColor = () => {
    switch (cycleInfo.phase) {
      case 'Menstruation':
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
            <label>Last Period Date</label>
            <input
              type="date"
              value={cycleData.lastPeriodDate}
              onChange={handleDateChange}
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
                value={cycleData.cycleLength}
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
                value={cycleData.periodLength}
                onChange={handlePeriodLengthChange}
                className="tracker-input"
              />
            </div>
          </div>
        </div>

        {cycleData.lastPeriodDate && (
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
                <p className="next-period-date">{cycleInfo.nextPeriod}</p>
                <p className="days-until">{cycleInfo.daysUntilNextPeriod} days away</p>
              </div>
            </div>

            <div className="symptoms-section">
              <h3 className="symptoms-title">Track Your Symptoms</h3>
              <div className="symptoms-grid">
                {symptomOptions.map((symptom) => (
                  <button
                    key={symptom}
                    className={`symptom-btn ${selectedSymptoms.includes(symptom) ? 'active' : ''}`}
                    onClick={() => toggleSymptom(symptom)}
                  >
                    {symptom}
                  </button>
                ))}
              </div>
            </div>

            <div className="phase-info">
              <h3>About This Phase</h3>
              <p className="phase-description">
                {cycleInfo.phase === 'Menstruation' && 
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
