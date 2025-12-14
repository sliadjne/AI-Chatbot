import { useState, useMemo, useEffect } from 'react';
import './Dashboard.css';
import SurveyTab from './SurveyTab';
import MonthlyLogs from './MonthlyLogs';
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
  const [monthlyLogs, setMonthlyLogs] = useState({}); // { '2025-11': { predictedStart, predictedEnd, actualStart, actualEnd, createdAt }}
  const [firstEntryDate, setFirstEntryDate] = useState(null);
  const [prefillEntryDate, setPrefillEntryDate] = useState(null);

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

  // Helper: prefer explicit tracker `cycleData` as the calendar base; fall back to survey only when tracker is empty
  const getSourceCycle = () => {
    if (cycleData && cycleData.lastPeriodDate) {
      return {
        startDate: cycleData.lastPeriodDate,
        periodEndDate: cycleData.periodEndDate || null,
        ongoing: cycleData.ongoing || false,
        cycleLength: Number(cycleData.cycleLength) || 28,
        periodLength: Number(cycleData.periodLength) || 5,
      };
    }
    if (surveyResults && surveyResults.answers && surveyResults.answers.last_period) {
      const a = surveyResults.answers;
      return {
        startDate: a.last_period || null,
        periodEndDate: a.period_end || null,
        ongoing: a.ongoing || false,
        cycleLength: Number(a.cycle_length) || 28,
        periodLength: Number(a.bleed_days) || 5,
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
    // Allow survey answers to annotate explicit period dates (without replacing tracker base)
    const surveyA = surveyResults?.answers;

    // Format the calendar date as YYYY-MM-DD string
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const checkDateStr = `${year}-${month}-${day}`;

    // If survey provided explicit last_period/period_end, honor those days as menstruation overlays
    if (surveyA && surveyA.last_period) {
      const s = surveyA.last_period;
      const e = surveyA.period_end;
      if (surveyA.ongoing) {
        if (checkDateStr >= s) return 'menstruation';
      } else if (e) {
        if (checkDateStr >= s && checkDateStr <= e) return 'menstruation';
      }
    }

    const src = getSourceCycle();
    if (!src || !src.startDate) return null;

    const startDateStr = src.startDate;
    const endDateStr = src.periodEndDate;

    // FIRST: Direct comparison for logged period (actual menstruation) from tracker base
    if (src.ongoing) {
      if (checkDateStr >= startDateStr) return 'menstruation';
    } else if (endDateStr) {
      if (checkDateStr >= startDateStr && checkDateStr <= endDateStr) return 'menstruation';
    }

    // If cycle length is not explicitly provided, do not attempt to compute other phases.
    // This enforces the separation between the History layer (logged start/end) and Prediction layer (cycle lengths).
    if (!src.cycleLength) return null;

    // SECOND: Calculate other phases based on cycle length
    const start = parseLocalDate(startDateStr);
    const check = parseLocalDate(checkDateStr);
    if (!start || !check) return null;

    const cycleLen = src.cycleLength || 28;
    const periodLen = src.periodLength || 5;

    const daysSinceStart = Math.floor((check - start) / (1000 * 60 * 60 * 24));
    if (daysSinceStart < 0) return null;

    const dayInCycle = daysSinceStart % cycleLen;
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

  // Data points now include uploaded dataset rows + per-day entries + survey results
  const dayEntriesCount = Object.keys(dayEntries || {}).length;
  const dataPointsCount = uploadedData.length + dayEntriesCount + (surveyResults ? 1 : 0);

  // Determine whether the user has provided any input at all
  const profileCount = [userProfile?.height, userProfile?.weight, userProfile?.age].filter(Boolean).length;
  const hasAnyInput = uploadedData.length > 0 || dayEntriesCount > 0 || !!surveyResults || !!(cycleData && cycleData.lastPeriodDate) || profileCount > 0;

  // Status: only show when survey results exist; otherwise show empty
  const displayStatus = surveyResults && surveyResults.prediction ? (surveyResults.prediction.includes('Possible') ? 'Imbalanced' : 'Balanced') : '';

  // Cycle regularity: compute only when user has input
  let cycleRegularityPercent = null;
  if (hasAnyInput) {
    if (cycleData && cycleData.cycleLength) {
      const cl = Number(cycleData.cycleLength);
      cycleRegularityPercent = (cl >= 24 && cl <= 35) ? 95 : 40;
    } else if (surveyResults) {
      cycleRegularityPercent = surveyResults.answers?.regularity === 'regular' ? 95 : 40;
    } else {
      cycleRegularityPercent = 75;
    }
  }

  // Symptom severity: compute only when user has input
  let symptomSeverityPercent = null;
  if (hasAnyInput) {
    if (dayEntriesCount > 0) {
      const totalSymptoms = Object.values(dayEntries).reduce((sum, e) => sum + ((e.symptoms || []).length), 0);
      const avgSymptoms = totalSymptoms / dayEntriesCount; // average per entry
      symptomSeverityPercent = Math.min(100, Math.round((avgSymptoms / 6) * 100));
    } else if (surveyResults) {
      symptomSeverityPercent = Math.min(100, (surveyResults.vector?.[2] || 0) * 10);
    } else {
      symptomSeverityPercent = 55;
    }
  }

  // Data completeness: compute only when user has input
  let dataCompletenessPercent = null;
  if (hasAnyInput) {
    dataCompletenessPercent = 20;
    // profile completeness
    dataCompletenessPercent += Math.round((profileCount / 3) * 25); // up to 25
    // uploaded data
    dataCompletenessPercent += Math.min(25, uploadedData.length * 5);
    // day entries contribution
    dataCompletenessPercent += Math.min(30, dayEntriesCount * 2);
    // survey presence bonus
    if (surveyResults) dataCompletenessPercent += 10;
    dataCompletenessPercent = Math.min(100, dataCompletenessPercent);
  }

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

  // Current phase using logged data/calendar logic — ONLY if user has entered data
  const today = new Date();
  const hasUserData = !!(sourceCycle && sourceCycle.startDate);
  const rawPhase = hasUserData ? phaseForDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0)) : null;
  const phaseLabelMap = {
    menstruation: 'Menstrual',
    follicular: 'Follicular',
    ovulation: 'Ovulation',
    luteal: 'Luteal',
  };
  const currentPhaseLabel = rawPhase ? (phaseLabelMap[rawPhase] || String(rawPhase)) : '—';

  // Day of cycle (calculate from startDate if available)
  let dayOfCycle = null;
  if (hasUserData && sourceCycle && sourceCycle.startDate) {
    const start = parseLocalDate(sourceCycle.startDate);
    if (start) {
      const diffDays = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate(),0,0,0,0) - start) / (1000 * 60 * 60 * 24));
      // Only compute dayOfCycle when an explicit cycleLength is provided (prediction layer).
      if (sourceCycle.cycleLength) {
        const cycleLen = Math.max(1, Number(sourceCycle.cycleLength));
        dayOfCycle = (((diffDays % cycleLen) + cycleLen) % cycleLen) + 1; // 1-indexed
      } else {
        dayOfCycle = null;
      }
    }
  }

  const calculateNextPeriod = () => {
    if (!sourceCycle || !sourceCycle.startDate) return null;

    // Require an explicit cycleLength to perform predictions. If absent, the system only treats
    // start/end dates as historical logs and will not predict future cycles.
    if (!sourceCycle.cycleLength && sourceCycle.cycleLength !== 0) return null;

    const cycleLen = Math.max(1, Number(sourceCycle.cycleLength));
    // Prefer periodEndDate if ongoing/available (use latest known date as base)
    const baseStr = sourceCycle.ongoing && sourceCycle.periodEndDate ? sourceCycle.periodEndDate : sourceCycle.startDate;
    let base = parseLocalDate(baseStr);
    if (!base) return null;

    // Normalise to local day start
    let predicted = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // If the base is already in the past, step forward in cycle intervals until we reach today or later.
    let safety = 0;
    while (predicted < todayStart && safety < 500) {
      predicted = new Date(predicted.getFullYear(), predicted.getMonth(), predicted.getDate() + cycleLen);
      safety += 1;
    }

    // If predicted still before today due to very large gaps, keep stepping but cap iterations (safety above)
    return predicted;
  };

  // Helper: format YYYY-MM key for monthly logs based on a Date object
  const monthKeyFromDate = (dateObj) => {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
  };

  // Populate monthly logs strictly from the month of `firstEntryDate` through the current month.
  // For each month in that inclusive range, compute the predicted start/end (if falling in that month)
  // using the user's tracker `cycleData` (firstEntryDate is typically their first logged period start).
  const populateLogsRange = (firstStartStr, cycleLen, periodLen) => {
    if (!firstStartStr) return;
    const base = parseLocalDate(firstStartStr);
    if (!base) return;
    const now = new Date();
    const startMonthIndex = base.getFullYear() * 12 + base.getMonth();
    const endMonthIndex = now.getFullYear() * 12 + now.getMonth();

    const predictedMap = computePredictedMap(firstStartStr, cycleLen, periodLen, startMonthIndex, endMonthIndex);

    setMonthlyLogs((prev) => {
      const next = { ...prev };

      for (let m = startMonthIndex; m <= endMonthIndex; m++) {
        const year = Math.floor(m / 12);
        const month = m % 12;
        const monthDate = new Date(year, month, 1);
        const key = monthKeyFromDate(monthDate);

        if (!next[key]) next[key] = { predictedStart: null, predictedEnd: null, actualStart: null, actualEnd: null, createdAt: new Date().toISOString() };

        if (predictedMap[key]) {
          // Overwrite predicted values with the authoritative prediction
          next[key].predictedStart = predictedMap[key].predictedStart;
          next[key].predictedEnd = predictedMap[key].predictedEnd;
        }
      }

      return next;
    });
  };

  // Compute a map of predicted cycles keyed by YYYY-MM using the authoritative calendar base
  const computePredictedMap = (baseStartStr, cycleLen, periodLen, startMonthIndex, endMonthIndex) => {
    const out = {};
    if (!baseStartStr || !cycleLen) return out;
    const base = parseLocalDate(baseStartStr);
    if (!base) return out;

    let predicted = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    let safety = 0;
    while ((predicted.getFullYear() * 12 + predicted.getMonth()) <= endMonthIndex && safety < 1000) {
      const key = monthKeyFromDate(predicted);
      const predictedStart = `${predicted.getFullYear()}-${String(predicted.getMonth() + 1).padStart(2, '0')}-${String(predicted.getDate()).padStart(2, '0')}`;
      const predictedEndDate = new Date(predicted.getFullYear(), predicted.getMonth(), predicted.getDate());
      predictedEndDate.setDate(predictedEndDate.getDate() + (periodLen - 1));
      const predictedEnd = `${predictedEndDate.getFullYear()}-${String(predictedEndDate.getMonth() + 1).padStart(2, '0')}-${String(predictedEndDate.getDate()).padStart(2, '0')}`;
      out[key] = { predictedStart, predictedEnd };
      predicted.setDate(predicted.getDate() + cycleLen);
      safety += 1;
    }

    return out;
  };

  // Ensure predicted logs exist and mirror the calendar's authoritative predictions
  const ensurePredictedLogs = (baseStartStr, cycleLen, periodLen) => {
    // Require base and first entry date to enforce strict month range (firstEntryDate -> current month)
    if (!baseStartStr || !cycleLen || !firstEntryDate) return;
    const base = parseLocalDate(baseStartStr);
    if (!base) return;
    const now = new Date();
    const startMonthIndex = parseLocalDate(firstEntryDate).getFullYear() * 12 + parseLocalDate(firstEntryDate).getMonth();
    const endMonthIndex = now.getFullYear() * 12 + now.getMonth(); // current month only

    const predictedMap = computePredictedMap(baseStartStr, cycleLen, periodLen, startMonthIndex, endMonthIndex);

    setMonthlyLogs((prev) => {
      const next = { ...prev };
      for (let m = startMonthIndex; m <= endMonthIndex; m++) {
        const year = Math.floor(m / 12);
        const month = m % 12;
        const monthDate = new Date(year, month, 1);
        const key = monthKeyFromDate(monthDate);

        if (!next[key]) next[key] = { predictedStart: null, predictedEnd: null, actualStart: null, actualEnd: null, createdAt: new Date().toISOString() };
        if (predictedMap[key]) {
          // Always synchronize predicted values from authoritative source
          next[key].predictedStart = predictedMap[key].predictedStart;
          next[key].predictedEnd = predictedMap[key].predictedEnd;
        }
      }
      return next;
    });
  };

  const recordActualPeriod = (actualStartStr, actualEndStr) => {
    if (!actualStartStr) return;
    const actualDate = parseLocalDate(actualStartStr);
    if (!actualDate) return;
    // Mark first entry date if this is the earliest actual we have
    if (!firstEntryDate) setFirstEntryDate(actualStartStr);
    const key = monthKeyFromDate(actualDate);
    setMonthlyLogs((prev) => {
      const next = { ...prev };
      if (!next[key]) {
        // create an empty predicted slot (unknown) and fill actuals
        next[key] = { predictedStart: null, predictedEnd: null, actualStart: actualStartStr || null, actualEnd: actualEndStr || null, createdAt: new Date().toISOString() };
      } else {
        // fill actuals if not already present
        if (!next[key].actualStart) next[key].actualStart = actualStartStr || null;
        if (!next[key].actualEnd) next[key].actualEnd = actualEndStr || null;
      }
      return next;
    });
  };

  // Explicit update when user edits actuals from the UI
  const updateActualPeriod = (monthKey, actualStartStr, actualEndStr) => {
    setMonthlyLogs((prev) => {
      const next = { ...prev };
      if (!next[monthKey]) {
        // create a new slot if missing
        next[monthKey] = { predictedStart: null, predictedEnd: null, actualStart: actualStartStr || null, actualEnd: actualEndStr || null, createdAt: new Date().toISOString() };
      } else {
        next[monthKey] = { ...next[monthKey], actualStart: actualStartStr || null, actualEnd: actualEndStr || null };
      }
      return next;
    });
  };

  // If user sets their cycleData for the first time, and we don't have a firstEntryDate, capture it
  useEffect(() => {
    if (!firstEntryDate && cycleData && cycleData.lastPeriodDate) {
      setFirstEntryDate(cycleData.lastPeriodDate);
    }
  }, [cycleData, firstEntryDate]);

  // When firstEntryDate or cycleData changes, repopulate monthly logs for the allowed range
  useEffect(() => {
    if (!firstEntryDate) return;
    // only populate up to current month and only when cycleLength exists
    const cycleLen = cycleData?.cycleLength ? Number(cycleData.cycleLength) : null;
    const periodLen = cycleData?.periodLength ? Number(cycleData.periodLength) : 5;
    // Prefer calendar base (tracker cycle start) if available so logs mirror calendar predictions
    const baseStart = getSourceCycle()?.startDate || firstEntryDate;
    // Populate immediately
    populateLogsRange(baseStart, cycleLen, periodLen);

    // Schedule a one-off update at the start of the next month to add the new month's log
    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    const msUntilNextMonth = nextMonthStart - now;
    const t = setTimeout(() => {
      populateLogsRange(baseStart, cycleLen, periodLen);
    }, msUntilNextMonth + 1000);

    return () => clearTimeout(t);
  }, [firstEntryDate, cycleData]);

  const openTrackerForMonth = (monthKey) => {
    // Convert monthKey YYYY-MM into a date string for prefill (use first day)
    const [y, m] = monthKey.split('-').map(Number);
    const prefill = `${y}-${String(m).padStart(2, '0')}-01`;
    setPrefillEntryDate(prefill);
    setActiveTab('tracker');
  };

  // Recompute predicted logs when cycle data changes (use tracker base only)
  useEffect(() => {
    if (cycleData && cycleData.lastPeriodDate && cycleData.cycleLength) {
      ensurePredictedLogs(cycleData.lastPeriodDate, Number(cycleData.cycleLength), Number(cycleData.periodLength || 5));
    }
  }, [cycleData]);

  const nextPeriodDate = calculateNextPeriod();
  const nextPeriodDisplay = nextPeriodDate ? nextPeriodDate.toLocaleDateString() : '–';
  const daysUntilNext = nextPeriodDate ? Math.ceil((new Date(nextPeriodDate.getFullYear(), nextPeriodDate.getMonth(), nextPeriodDate.getDate(),0,0,0,0) - new Date(today.getFullYear(), today.getMonth(), today.getDate(),0,0,0,0)) / (1000 * 60 * 60 * 24)) : null;
  const isNextPeriodToday = daysUntilNext === 0;

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
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📚 Cycle Logs
        </button>
        <button
          className={`tab-btn ${activeTab === 'dataset' ? 'active' : ''}`}
          onClick={() => setActiveTab('dataset')}
        >
          📈 AI Insights
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="tab-content-inner">
          <div className="stats-section">
            <h2>Key Metrics</h2>
            <div className="metrics-container">
              <div className={`metric-card ${cycleRegularityPercent === null ? 'empty' : ''}`}>
                <h4>Cycle Regularity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${cycleRegularityPercent || 0}%` }}></div>
                </div>
                <span className="metric-label">{cycleRegularityPercent !== null ? `${cycleRegularityPercent}%` : '—'}</span>
              </div>

              <div className={`metric-card ${symptomSeverityPercent === null ? 'empty' : ''}`}>
                <h4>Symptom Severity</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${symptomSeverityPercent || 0}%` }}></div>
                </div>
                <span className="metric-label">{symptomSeverityPercent !== null ? `${symptomSeverityPercent}%` : '—'}</span>
              </div>

              <div className={`metric-card ${dataCompletenessPercent === null ? 'empty' : ''}`}>
                <h4>Data Completeness</h4>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${dataCompletenessPercent || 0}%` }}></div>
                </div>
                <span className="metric-label">{dataCompletenessPercent !== null ? `${dataCompletenessPercent}%` : '—'}</span>
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

                <div className={`summary-card ${isNextPeriodToday ? 'today' : ''}`}>
                  <h4>Next Period</h4>
                  <div className="summary-value">{nextPeriodDisplay}</div>
                  <div className="summary-meta">{daysUntilNext !== null ? `${daysUntilNext} days` : '—'}</div>
                </div>

                <div className="summary-card">
                  <h4>Status</h4>
                  <div className="summary-value">{displayStatus}</div>
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

            <div className="cta-section">
              <div className="cta-card">
                <div className="cta-icon">💚</div>
                <div className="cta-content">
                  <h3>Want to know more about your menstrual health?</h3>
                  <p>Take our short survey to get personalized insights and AI-powered recommendations.</p>
                  <button className="cta-button" onClick={() => setActiveTab('tracker')}>
                    Start Survey →
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
          </div>
      )}

      {/* Combined Tracker tab: widgets top, calendar/per-day entry below */}
      {activeTab === 'tracker' && (
        <div className="tab-content">
          <div className="tab-content-inner">
          <div className="tracker-layout">
            <div className="tracker-top-left">
              <div className="widgets-grid compact">
                <div className="widget small">
                  <div className="widget-icon">🔴</div>
                  <div className="widget-content">
                    <h3>Phase</h3>
                    <p className="widget-value">{hasUserData ? currentPhaseLabel : '—'}</p>
                    <span className="widget-meta">{hasUserData ? `Day ${dayOfCycle || '–'}` : 'No data'}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">⏰</div>
                  <div className="widget-content">
                    <h3>Next</h3>
                    <p className={`widget-value ${isNextPeriodToday ? 'today' : ''}`}>{nextPeriodDisplay}</p>
                    <span className="widget-meta">{daysUntilNext !== null ? (isNextPeriodToday ? 'Today' : `${daysUntilNext}d`) : 'Next period'}</span>
                  </div>
                </div>

                <div className="widget small">
                  <div className="widget-icon">🤖</div>
                  <div className="widget-content">
                    <h3>AI Assessment</h3>
                    {mlPrediction ? (
                      <>
                        <p className="widget-value">{mlPrediction.riskLevel.toUpperCase()}</p>
                        <span className="widget-meta">{mlPrediction.prediction === 1 ? 'Possible PCOS' : 'Normal'} ({(mlPrediction.confidence * 100).toFixed(0)}%)</span>
                      </>
                    ) : (
                      <>
                        <p className="widget-value">—</p>
                        <span className="widget-meta">Complete survey</span>
                      </>
                    )}
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
              {/* Reminder widget above calendar — only in Cycle & Tracker tab */}
              {(() => {
                const currentKey = monthKeyFromDate(new Date());
                const currentEntry = monthlyLogs && monthlyLogs[currentKey];
                const showReminder = !!currentEntry && (!currentEntry.actualStart || !currentEntry.actualEnd);
                return showReminder ? (
                  <div className="calendar-reminder">
                    <div className="reminder-text">💗 Don’t forget to log your period days this month, girly!</div>
                    <button className="reminder-btn" onClick={() => setActiveTab('logs')}>Log my period ✨</button>
                  </div>
                ) : null;
              })()}

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
                    onPeriodLogged={(s,e) => recordActualPeriod(s,e)}
                    nextPeriodDate={nextPeriodDate}
                    daysUntilNext={daysUntilNext}
                    isNextPeriodToday={isNextPeriodToday}
                    monthlyLogs={monthlyLogs}
                    prefillDate={prefillEntryDate}
                />
              </div>
            </div>
          </div>
        </div>
          </div>
      )}

      {/* Dataset Tab */}
      {activeTab === 'dataset' && (
        <div className="tab-content">
          <div className="tab-content-inner">
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
                      {cycleData?.lastPeriodDate && (
                        <div className="feature-item">
                          <span className="feature-name">Menstrual Irregularity</span>
                          <span className="feature-value">{mlPrediction.features.Menstrual_Irregularity === 1 ? 'Irregular' : 'Regular'}</span>
                        </div>
                      )}
                      {userProfile?.height && userProfile?.weight && (
                        <div className="feature-item">
                          <span className="feature-name">BMI</span>
                          <span className="feature-value">
                            {mlPrediction.features.BMI.toFixed(1)}
                            <span style={{fontSize: '11px', color: '#718096', marginLeft: '5px'}}>
                              ({userProfile.height}cm, {userProfile.weight}kg)
                            </span>
                          </span>
                        </div>
                      )}
                      {userProfile?.age && (
                        <div className="feature-item">
                          <span className="feature-name">Age</span>
                          <span className="feature-value">
                            {mlPrediction.features.Age} years
                          </span>
                        </div>
                      )}
                      {cycleData?.cycleLength && (
                        <div className="feature-item">
                          <span className="feature-name">Cycle Length</span>
                          <span className="feature-value">{mlPrediction.features.cycleLength} days</span>
                        </div>
                      )}
                      {!cycleData?.lastPeriodDate && !userProfile?.height && !userProfile?.weight && !userProfile?.age && (
                        <div style={{gridColumn: '1/-1', textAlign: 'center', color: '#a0aec0', padding: '20px', fontSize: '14px'}}>
                          Enter cycle data and profile info in the "Cycle & Tracker" tab to see feature analysis.
                        </div>
                      )}
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
          </div>
      )}
      {/* Logs Tab (temporarily simplified while debugging) */}
      {activeTab === 'logs' && (
        <div className="tab-content">
          <div className="tab-content-inner">
            <div className="logs-section">
              <h2>📚 Cycle Logs</h2>
              <p className="muted">Monthly predicted vs actual tracking. Logs UI is available.</p>
              <MonthlyLogs monthlyLogs={monthlyLogs} onLogActual={(k,s,e) => recordActualPeriod(s,e)} onUpdateActual={(k,s,e) => updateActualPeriod(k,s,e)} onOpenLog={(k) => openTrackerForMonth(k)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
