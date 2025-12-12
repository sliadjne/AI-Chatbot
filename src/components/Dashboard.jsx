import { useState, useMemo, useEffect } from 'react';
import './Dashboard.css';
import SurveyTab from './SurveyTab';
import MenstrualTracker from './MenstrualTracker';
import CycleVisualizations from './CycleVisualizations';
import { mapUserDataToFeatures, predictPCOS } from '../utils/mlPrediction';
import { useMLPrediction } from '../context/MLPredictionContext';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [datasetFile, setDatasetFile] = useState(null);
  const [uploadedData, setUploadedData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [surveyResults, setSurveyResults] = useState(null);
  const [cycleData, setCycleData] = useState({ lastPeriodDate: '', periodEndDate: '', ongoing: false, cycleLength: 28, periodLength: 5 });
  const [dayEntries, setDayEntries] = useState({}); // { '2025-12-11': { mood: 'sad', symptoms: ['Cramps'] }
  const [userProfile, setUserProfile] = useState({ height: '', weight: '', age: '' }); // Height in cm, Weight in kg }

  // Generate calendar days
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const calendarDays = [];
  const daysInMonth = getDaysInMonth(selectedDate);
  const firstDay = getFirstDayOfMonth(selectedDate);

  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Helper: prefer survey results, then cycleData
  const getSourceCycle = () => {
    if (surveyResults && surveyResults.answers) {
      const a = surveyResults.answers;
      return {
        startDate: a.last_period || null,
        periodEndDate: a.period_end || null,
        ongoing: a.ongoing || false,
        cycleLength: Number(a.cycle_length) || 28,
        periodLength: Number(a.bleed_days) || 5,
      };
    }
    if (cycleData && cycleData.lastPeriodDate) {
      return {
        startDate: cycleData.lastPeriodDate,
        periodEndDate: cycleData.periodEndDate || null,
        ongoing: cycleData.ongoing || false,
        cycleLength: Number(cycleData.cycleLength) || 28,
        periodLength: Number(cycleData.periodLength) || 5,
      };
    }
    return null;
  };

  // Helper: Parse date string (YYYY-MM-DD format) as local date at midnight
  const parseLocalDate = (dateString) => {
    if (!dateString) return null;
    // Handle both YYYY-MM-DD and MM/DD/YYYY formats
    let year, month, day;
    if (dateString.includes('-')) {
      [year, month, day] = dateString.split('-').map(Number);
      month = month - 1; // month is 0-indexed in Date constructor
    } else if (dateString.includes('/')) {
      [month, day, year] = dateString.split('/').map(Number);
      month = month - 1; // month is 0-indexed in Date constructor
    } else {
      return null;
    }
    // Create date at midnight local time
    return new Date(year, month, day, 0, 0, 0, 0);
  };

  const phaseForDate = (dateObj) => {
    const src = getSourceCycle();
    if (!src || !src.startDate) return null;
    
    // Format the calendar date as YYYY-MM-DD string
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const checkDateStr = `${year}-${month}-${day}`;
    
    const startDateStr = src.startDate;
    const endDateStr = src.periodEndDate;
    
    // FIRST: Direct comparison for logged period (actual menstruation)
    if (src.ongoing) {
      // If ongoing, show menstruation from start date onwards
      if (checkDateStr >= startDateStr) {
        return 'menstruation';
      }
    } else if (endDateStr) {
      // If end date is set, show menstruation between start and end (inclusive)
      if (checkDateStr >= startDateStr && checkDateStr <= endDateStr) {
        return 'menstruation';
      }
    }
    
    // SECOND: Calculate other phases based on cycle length
    // Parse both dates to calculate days between them
    const start = parseLocalDate(startDateStr);
    const check = parseLocalDate(checkDateStr);
    
    if (!start || !check) return null;
    
    const cycleLen = src.cycleLength || 28;
    const periodLen = src.periodLength || 5;
    
    // Calculate days from start
    const daysSinceStart = Math.floor((check - start) / (1000 * 60 * 60 * 24));
    
    // If we're in the past before the cycle start, no phase
    if (daysSinceStart < 0) return null;
    
    // Get day in current cycle (0-indexed)
    const dayInCycle = daysSinceStart % cycleLen;
    
    // Determine phase based on day in cycle
    if (dayInCycle < periodLen) return 'menstruation';
    if (dayInCycle < 13) return 'follicular';
    if (dayInCycle < 16) return 'ovulation';
    return 'luteal';
  };

  const formatDateKey = (year, month, day) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const handlePrevMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDatasetFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          setUploadedData(Array.isArray(data) ? data : [data]);
        } catch (error) {
          alert('Please upload a valid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  const monthName = selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Derive overview metrics from survey results when available
  const computePhaseFromSurvey = (results) => {
    // Prefer survey results if present
    if (results && results.answers && results.answers.last_period) {
      const { answers } = results;
      const cycleLength = Number(answers.cycle_length) || 28;
      const last = answers.last_period;
      const lastDate = new Date(last);
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      const day = ((diffDays % cycleLength) + cycleLength) % cycleLength || cycleLength;
      let phase = 'Follicular';
      if (day <= 5) phase = 'Menstrual';
      else if (day <= 13) phase = 'Follicular';
      else if (day <= 16) phase = 'Ovulation';
      else phase = 'Luteal';
      return { phase, dayOfCycle: day, daysSinceLast: diffDays };
    }

    // Fallback to user's cycleData if available
    if (cycleData && cycleData.lastPeriodDate) {
      const cycleLength = Number(cycleData.cycleLength) || 28;
      const last = cycleData.lastPeriodDate;
      const lastDate = new Date(last);
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      const day = ((diffDays % cycleLength) + cycleLength) % cycleLength || cycleLength;
      let phase = 'Follicular';
      if (day <= 5) phase = 'Menstrual';
      else if (day <= 13) phase = 'Follicular';
      else if (day <= 16) phase = 'Ovulation';
      else phase = 'Luteal';
      return { phase, dayOfCycle: day, daysSinceLast: diffDays };
    }

    return { phase: 'Luteal', dayOfCycle: 18 };
  };

  const surveyMetrics = computePhaseFromSurvey(surveyResults);
  const dataPointsCount = uploadedData.length + (surveyResults ? 1 : 0);
  const hormonalStatus = surveyResults && surveyResults.prediction && surveyResults.prediction.includes('Possible') ? 'Imbalanced' : (surveyResults ? 'Balanced' : 'Imbalanced');
  const cycleRegularityPercent = surveyResults ? (surveyResults.answers?.regularity === 'regular' ? 95 : 40) : 75;
  const symptomSeverityPercent = surveyResults ? Math.min(100, (surveyResults.vector?.[2] || 0) * 10) : 55;
  const dataCompletenessPercent = Math.min(100, 50 + Math.floor((uploadedData.length / 10) * 50));

  const { setMlPrediction, setUserFeatures } = useMLPrediction();

  // Calculate ML prediction
  const mlPrediction = useMemo(() => {
    if (!surveyResults && !cycleData?.lastPeriodDate) {
      return null;
    }
    const features = mapUserDataToFeatures(surveyResults, cycleData, dayEntries, userProfile);
    return predictPCOS(features);
  }, [surveyResults, cycleData, dayEntries, userProfile]);

  // Update context when prediction changes
  useEffect(() => {
    if (mlPrediction) {
      setMlPrediction(mlPrediction);
      setUserFeatures(mlPrediction.features);
    }
  }, [mlPrediction, setMlPrediction, setUserFeatures]);

  // Compute widget metrics from combined sources (survey OR tracker)
  const sourceCycle = getSourceCycle();

  // Current phase using logged data/calendar logic
  const today = new Date();
  const rawPhase = sourceCycle ? phaseForDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0)) : null;
  const phaseLabelMap = {
    menstruation: 'Menstrual',
    follicular: 'Follicular',
    ovulation: 'Ovulation',
    luteal: 'Luteal',
  };
  const currentPhaseLabel = rawPhase ? (phaseLabelMap[rawPhase] || String(rawPhase)) : surveyMetrics.phase || '—';

  // Day of cycle (calculate from startDate if available)
  let dayOfCycle = surveyMetrics.dayOfCycle || null;
  if (sourceCycle && sourceCycle.startDate) {
    const start = parseLocalDate(sourceCycle.startDate);
    if (start) {
      const diffDays = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate(),0,0,0,0) - start) / (1000 * 60 * 60 * 24));
      const cycleLen = Number(sourceCycle.cycleLength) || 28;
      dayOfCycle = (((diffDays % cycleLen) + cycleLen) % cycleLen) + 1; // 1-indexed
    }
  }

  const calculateNextPeriod = () => {
    if (!sourceCycle || !sourceCycle.startDate) return null;
    const cycleLen = Number(sourceCycle.cycleLength) || 28;
    // Prefer periodEndDate if ongoing/available
    const baseStr = sourceCycle.ongoing && sourceCycle.periodEndDate ? sourceCycle.periodEndDate : sourceCycle.startDate;
    const base = parseLocalDate(baseStr);
    if (!base) return null;
    const predicted = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    predicted.setDate(predicted.getDate() + cycleLen);
    return predicted;
  };

  const nextPeriodDate = calculateNextPeriod();
  const nextPeriodDisplay = nextPeriodDate ? nextPeriodDate.toLocaleDateString() : '–';
  const daysUntilNext = nextPeriodDate ? Math.ceil((new Date(nextPeriodDate.getFullYear(), nextPeriodDate.getMonth(), nextPeriodDate.getDate(),0,0,0,0) - new Date(today.getFullYear(), today.getMonth(), today.getDate(),0,0,0,0)) / (1000 * 60 * 60 * 24)) : null;

  // Overview summary helpers
  const formatLocalFromYMD = (ymd) => {
    if (!ymd) return '–';
    const d = parseLocalDate(ymd);
    return d ? d.toLocaleDateString() : '–';
  };

  const getMostRecentEntry = () => {
    const keys = Object.keys(dayEntries || {});
    if (!keys.length) return null;
    // keys are YYYY-MM-DD — sort lexicographically
    keys.sort();
    const k = keys[keys.length - 1];
    return { date: k, entry: dayEntries[k] };
  };

  const recentEntry = getMostRecentEntry();

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">❤️Health Dashboard</h1>
        <p className="dashboard-subtitle">Track hormonal imbalances and cycle data</p>
      </div>

      {/* Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'tracker' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracker')}
        >
          🩸 Cycle & Tracker
        </button>
        <button
          className={`tab-btn ${activeTab === 'dataset' ? 'active' : ''}`}
          onClick={() => setActiveTab('dataset')}
        >
          📈 Dataset & Analysis
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="stats-section">
            <h2>Key Metrics</h2>
            <div className="metrics-container">
              <div className="metric-card">
                <h4>Cycle Regularity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${cycleRegularityPercent}%` }}></div>
                </div>
                <span className="metric-label">{cycleRegularityPercent}%</span>
              </div>

              <div className="metric-card">
                <h4>Symptom Severity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${symptomSeverityPercent}%` }}></div>
                </div>
                <span className="metric-label">{symptomSeverityPercent}%</span>
              </div>

              <div className="metric-card">
                <h4>Data Completeness</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${dataCompletenessPercent}%` }}></div>
                </div>
                <span className="metric-label">{dataCompletenessPercent}%</span>
              </div>
            </div>
            <div className="overview-summary">
              <h3>Summary</h3>
              <div className="summary-cards">
                <div className="summary-card">
                  <h4>Phase</h4>
                  <div className="summary-value">{currentPhaseLabel}</div>
                  <div className="summary-meta">Day {dayOfCycle || '–'}</div>
                </div>

                <div className="summary-card">
                  <h4>Next Period</h4>
                  <div className="summary-value">{nextPeriodDisplay}</div>
                  <div className="summary-meta">{daysUntilNext !== null ? `${daysUntilNext} days` : '—'}</div>
                </div>

                <div className="summary-card">
                  <h4>Status</h4>
                  <div className="summary-value">{hormonalStatus}</div>
                  <div className="summary-meta">{surveyResults ? surveyResults.prediction : 'No survey'}</div>
                </div>

                <div className="summary-card">
                  <h4>Points</h4>
                  <div className="summary-value">{dataPointsCount}</div>
                  <div className="summary-meta">Entries</div>
                </div>

                <div className="summary-card">
                  <h4>Last Period</h4>
                  <div className="summary-value">{formatLocalFromYMD(getSourceCycle()?.startDate)}</div>
                  <div className="summary-meta">Length {getSourceCycle()?.cycleLength || '–'} days</div>
                </div>

                <div className="summary-card">
                  <h4>Recent Entry</h4>
                  <div className="summary-value">{recentEntry ? formatLocalFromYMD(recentEntry.date) : 'No entries'}</div>
                  <div className="summary-meta">{recentEntry ? (recentEntry.entry.mood || Object.keys(recentEntry.entry.symptoms || {}).length ? (recentEntry.entry.symptoms || []).join(', ') : '—') : ''}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Combined Tracker tab: widgets top, calendar/per-day entry below */}
      {activeTab === 'tracker' && (
        <div className="tab-content">
          <div className="tracker-layout">
            <div className="tracker-top-left">
              <div className="widgets-grid compact">
                <div className="widget small">
                  <div className="widget-icon">🔴</div>
                  <div className="widget-content">
                    <h3>Phase</h3>
                    <p className="widget-value">{currentPhaseLabel}</p>
                    <span className="widget-meta">Day {dayOfCycle || '–'}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">⏰</div>
                  <div className="widget-content">
                    <h3>Next</h3>
                    <p className="widget-value">{nextPeriodDisplay}</p>
                    <span className="widget-meta">{daysUntilNext !== null ? `${daysUntilNext}d` : 'Next period'}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">⚡</div>
                  <div className="widget-content">
                    <h3>Status</h3>
                    <p className="widget-value">{hormonalStatus}</p>
                    <span className="widget-meta">{surveyResults ? surveyResults.prediction : 'Review'}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">📊</div>
                  <div className="widget-content">
                    <h3>Points</h3>
                    <p className="widget-value">{dataPointsCount}</p>
                    <span className="widget-meta">Entries</span>
                  </div>
                </div>
              </div>

              <div className="compact-metrics">
                <div className="metric-row"><strong>Regularity:</strong> {cycleRegularityPercent}%</div>
                <div className="metric-row"><strong>Symptoms:</strong> {symptomSeverityPercent}%</div>
                <div className="metric-row"><strong>Completeness:</strong> {dataCompletenessPercent}%</div>
              </div>
            </div>

            <div className="tracker-top-right">
              <div className="card">
                <h4>Survey</h4>
                <SurveyTab onComplete={(results) => setSurveyResults(results)} />
              </div>
            </div>

            <div className="tracker-bottom-left">
              <div className="calendar-container compact-calendar">
                <div className="calendar-header">
                  <button className="calendar-nav-btn" onClick={handlePrevMonth}>←</button>
                  <h2 className="calendar-title">{monthName}</h2>
                  <button className="calendar-nav-btn" onClick={handleNextMonth}>→</button>
                </div>

                <div className="calendar-weekdays">
                  <div className="weekday">Sun</div>
                  <div className="weekday">Mon</div>
                  <div className="weekday">Tue</div>
                  <div className="weekday">Wed</div>
                  <div className="weekday">Thu</div>
                  <div className="weekday">Fri</div>
                  <div className="weekday">Sat</div>
                </div>

                <div className="calendar-days">
                  {calendarDays.map((day, index) => {
                    if (day === null) return <div key={index} className={`calendar-day empty`}></div>;
                    const year = selectedDate.getFullYear();
                    const month = selectedDate.getMonth();
                    // Create date at midnight to match phaseForDate comparison
                    const dateObj = new Date(year, month, day, 0, 0, 0, 0);
                    const dateKey = formatDateKey(year, month, day);
                    const hasEntry = !!(dayEntries && dayEntries[dateKey]);
                    const phase = phaseForDate(dateObj);
                    return (
                      <div
                        key={index}
                        className={`calendar-day ${phase ? phase : ''} ${
                          day === new Date().getDate() && selectedDate.getMonth() === new Date().getMonth() ? 'today' : ''
                        } ${hasEntry ? 'has-entry' : ''}`}
                        title={`${dateObj.toLocaleDateString()}${phase ? ' — ' + phase : ''}${hasEntry ? ' — entry' : ''}`}
                      >
                        {day}
                        {hasEntry && <div className="entry-dot" title="Has entry"></div>}
                      </div>
                    );
                  })}
                </div>

                <div className="calendar-legend compact-legend">
                  <div className="legend-item"><div className="legend-color period"></div><span>Period</span></div>
                  <div className="legend-item"><div className="legend-color ovulation"></div><span>Ovulation</span></div>
                  <div className="legend-item"><div className="legend-color follicular"></div><span>Follicular</span></div>
                  <div className="legend-item"><div className="legend-color luteal"></div><span>Luteal</span></div>
                </div>
              </div>
            </div>

            <div className="tracker-bottom-right">
              <div className="card">
                <h4>Per-day Entry</h4>
                <MenstrualTracker
                  cycleData={cycleData}
                  setCycleData={setCycleData}
                  dayEntries={dayEntries}
                  setDayEntries={setDayEntries}
                  userProfile={userProfile}
                  setUserProfile={setUserProfile}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dataset Tab */}
      {activeTab === 'dataset' && (
        <div className="tab-content">
          <div className="dataset-section">
            <h2>📈 AI Analysis & Insights</h2>
            
            {/* AI Prediction Section */}
            {!mlPrediction ? (
              <div className="analysis-placeholder">
                <p>Complete the survey or enter cycle data in the "Cycle & Tracker" tab to get AI-powered insights.</p>
              </div>
            ) : (
              <div className="ai-analysis-section">
                <div className="prediction-card">
                  <h3>🤖 AI Health Assessment</h3>
                  <div className="prediction-result">
                    <div className={`risk-badge ${mlPrediction.riskLevel}`}>
                      <span className="risk-label">Risk Level:</span>
                      <span className="risk-value">{mlPrediction.riskLevel.toUpperCase()}</span>
                    </div>
                    <div className="prediction-details">
                      <div className="prediction-item">
                        <span className="prediction-label">Prediction:</span>
                        <span className="prediction-value">
                          {mlPrediction.prediction === 1 ? 'Possible PCOS Pattern' : 'Normal Pattern'}
                        </span>
                      </div>
                      <div className="prediction-item">
                        <span className="prediction-label">Confidence:</span>
                        <span className="prediction-value">{(mlPrediction.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="prediction-item">
                        <span className="prediction-label">Risk Score:</span>
                        <span className="prediction-value">{mlPrediction.riskScore}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="feature-mapping">
                    <h4>Feature Analysis</h4>
                    <div className="features-grid">
                      <div className="feature-item">
                        <span className="feature-name">Menstrual Irregularity</span>
                        <span className="feature-value">{mlPrediction.features.Menstrual_Irregularity === 1 ? 'Irregular' : 'Regular'}</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-name">
                          BMI {userProfile?.height && userProfile?.weight ? '' : '(Estimated)'}
                        </span>
                        <span className="feature-value">
                          {mlPrediction.features.BMI.toFixed(1)}
                          {userProfile?.height && userProfile?.weight && (
                            <span style={{fontSize: '11px', color: '#718096', marginLeft: '5px'}}>
                              (from {userProfile.height}cm, {userProfile.weight}kg)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-name">Testosterone Level (Estimated)</span>
                        <span className="feature-value">{mlPrediction.features['Testosterone_Level(ng/dL)'].toFixed(1)} ng/dL</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-name">Antral Follicle Count (Estimated)</span>
                        <span className="feature-value">{mlPrediction.features.Antral_Follicle_Count.toFixed(0)}</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-name">Cycle Length</span>
                        <span className="feature-value">{mlPrediction.features.cycleLength} days</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-name">
                          Age {userProfile?.age ? '' : '(Estimated)'}
                        </span>
                        <span className="feature-value">
                          {mlPrediction.features.Age} years
                          {userProfile?.age && (
                            <span style={{fontSize: '11px', color: '#718096', marginLeft: '5px'}}>
                              (from profile)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Insights Section */}
                <div className="insights-section">
                  <h3>💡 Personalized Insights & Recommendations</h3>
                  <div className="insights-list">
                    {mlPrediction.insights.map((insight, idx) => (
                      <div key={idx} className={`insight-card ${insight.type}`}>
                        <div className="insight-icon">
                          {insight.type === 'warning' && '⚠️'}
                          {insight.type === 'suggestion' && '💡'}
                          {insight.type === 'info' && 'ℹ️'}
                        </div>
                        <div className="insight-content">
                          <h4>{insight.title}</h4>
                          <p>{insight.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* Cycle Visualizations */}
            {(surveyResults || cycleData?.lastPeriodDate) && (
              <div className="visualizations-section">
                <h3>📊 Cycle Phase Visualizations</h3>
                <CycleVisualizations 
                  cycleData={cycleData} 
                  surveyResults={surveyResults} 
                  selectedDate={selectedDate}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
