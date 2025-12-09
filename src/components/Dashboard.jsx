import { useState } from 'react';
import './Dashboard.css';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [datasetFile, setDatasetFile] = useState(null);
  const [uploadedData, setUploadedData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

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
          className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          📅 Calendar
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
          <div className="widgets-grid">
            <div className="widget">
              <div className="widget-icon">🔴</div>
              <div className="widget-content">
                <h3>Current Phase</h3>
                <p className="widget-value">Luteal</p>
                <span className="widget-meta">Day 18 of 28</span>
              </div>
            </div>

            <div className="widget">
              <div className="widget-icon">⏰</div>
              <div className="widget-content">
                <h3>Next Period</h3>
                <p className="widget-value">10 Days</p>
                <span className="widget-meta">Dec 19, 2025</span>
              </div>
            </div>

            <div className="widget">
              <div className="widget-icon">⚡</div>
              <div className="widget-content">
                <h3>Hormonal Status</h3>
                <p className="widget-value">Imbalanced</p>
                <span className="widget-meta">Review data</span>
              </div>
            </div>

            <div className="widget">
              <div className="widget-icon">📊</div>
              <div className="widget-content">
                <h3>Data Points</h3>
                <p className="widget-value">{uploadedData.length}</p>
                <span className="widget-meta">Recorded entries</span>
              </div>
            </div>
          </div>

          <div className="stats-section">
            <h2>Key Metrics</h2>
            <div className="metrics-container">
              <div className="metric-card">
                <h4>Cycle Regularity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: '75%' }}></div>
                </div>
                <span className="metric-label">75%</span>
              </div>

              <div className="metric-card">
                <h4>Symptom Severity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: '55%' }}></div>
                </div>
                <span className="metric-label">55%</span>
              </div>

              <div className="metric-card">
                <h4>Data Completeness</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: '90%' }}></div>
                </div>
                <span className="metric-label">90%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="tab-content">
          <div className="calendar-container">
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
              {calendarDays.map((day, index) => (
                <div
                  key={index}
                  className={`calendar-day ${day === null ? 'empty' : ''} ${
                    day === new Date().getDate() &&
                    selectedDate.getMonth() === new Date().getMonth()
                      ? 'today'
                      : ''
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="calendar-legend">
              <div className="legend-item">
                <div className="legend-color today"></div>
                <span>Today</span>
              </div>
              <div className="legend-item">
                <div className="legend-color period"></div>
                <span>Period</span>
              </div>
              <div className="legend-item">
                <div className="legend-color ovulation"></div>
                <span>Ovulation</span>
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
