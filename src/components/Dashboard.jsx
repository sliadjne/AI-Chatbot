import { useState } from 'react';
import './Dashboard.css';
import SurveyTab from './SurveyTab';
import MenstrualTracker from './MenstrualTracker';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [datasetFile, setDatasetFile] = useState(null);
  const [uploadedData, setUploadedData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [surveyResults, setSurveyResults] = useState(null);
  const [cycleData, setCycleData] = useState({ lastPeriodDate: '', cycleLength: 28, periodLength: 5 });
  const [dayEntries, setDayEntries] = useState({}); // { '2025-12-11': { mood: 'sad', symptoms: ['Cramps'] } }

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

  const phaseForDate = (dateObj) => {
    const src = getSourceCycle();
    if (!src || !src.startDate) return null;
    const start = new Date(src.startDate);
    const dayDiff = Math.floor((dateObj - start) / (1000 * 60 * 60 * 24));
    // normalize
    const cycleLen = src.cycleLength || 28;
    const periodLen = src.periodLength || 5;
    const dayInCycle = ((dayDiff % cycleLen) + cycleLen) % cycleLen || cycleLen;

    // explicit menstruation window
    if (src.ongoing && dateObj >= start) return 'menstruation';
    if (src.periodEndDate) {
      const end = new Date(src.periodEndDate);
      if (dateObj >= start && dateObj <= end) return 'menstruation';
    }
    if (dayInCycle <= periodLen) return 'menstruation';
    if (dayInCycle <= 13) return 'follicular';
    if (dayInCycle <= 16) return 'ovulation';
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
                    <p className="widget-value">{surveyMetrics.phase}</p>
                    <span className="widget-meta">Day {surveyMetrics.dayOfCycle}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">⏰</div>
                  <div className="widget-content">
                    <h3>Next</h3>
                    <p className="widget-value">{surveyResults ? Math.max(0, (Number(surveyResults.answers?.cycle_length || 28) - surveyMetrics.dayOfCycle)) + 'd' : '–'}</p>
                    <span className="widget-meta">Next period</span>
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
                    const dateObj = new Date(year, month, day);
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
            <h2>📂 Dataset Management</h2>
            
            <div className="upload-area">
              <input
                type="file"
                id="file-input"
                accept=".json,.csv"
                onChange={handleFileUpload}
                className="file-input"
              />
              <label htmlFor="file-input" className="upload-label">
                <div className="upload-icon">📤</div>
                <p>Drag and drop your dataset or click to upload</p>
                <span className="upload-hint">JSON or CSV format</span>
              </label>
            </div>

            {datasetFile && (
              <div className="file-info">
                <h3>✅ File Uploaded</h3>
                <p className="file-name">{datasetFile.name}</p>
                <p className="file-size">{(datasetFile.size / 1024).toFixed(2)} KB</p>
              </div>
            )}

            {uploadedData.length > 0 && (
              <div className="data-preview">
                <h3>📊 Data Preview</h3>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        {uploadedData[0] && Object.keys(uploadedData[0]).map((key) => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedData.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          {Object.values(row).map((val, i) => (
                            <td key={i}>{String(val).substring(0, 30)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {uploadedData.length > 5 && (
                    <p className="data-count">Showing 5 of {uploadedData.length} records</p>
                  )}
                </div>
              </div>
            )}

            <div className="data-guidelines">
              <h3>📋 Data Format Guidelines</h3>
              <div className="guidelines-grid">
                <div className="guideline-card">
                  <h4>Required Fields</h4>
                  <ul>
                    <li>Date (YYYY-MM-DD)</li>
                    <li>Hormone Level (numeric)</li>
                    <li>Cycle Phase</li>
                  </ul>
                </div>

                <div className="guideline-card">
                  <h4>Optional Fields</h4>
                  <ul>
                    <li>Symptoms (text)</li>
                    <li>Flow Intensity</li>
                    <li>Mood Rating</li>
                  </ul>
                </div>

                <div className="guideline-card">
                  <h4>Sample JSON</h4>
                  <pre>{`{
  "date": "2025-12-09",
  "hormone_level": 45.5,
  "phase": "Luteal"
}`}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
