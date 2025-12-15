import { useState, useMemo, useEffect } from 'react';
import './Dashboard.css';
import SurveyTab from './SurveyTab';
import MonthlyLogs from './MonthlyLogs';
import MenstrualTracker from './MenstrualTracker';
import CycleVisualizations from './CycleVisualizations';
import { mapUserDataToFeatures, predictPCOS } from '../utils/mlPrediction';
import { computePhaseForDate } from '../utils/cycleUtils';
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
  const [predictedPhaseMap, setPredictedPhaseMap] = useState({}); // map YYYY-MM-DD -> { phaseCode, phaseLabel, dayInCycle }

  // Generate calendar days
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Normalize initial cycle: ensure exactly the earliest actual-start month is marked as the initial cycle
  useEffect(() => {
    const entries = monthlyLogs || {};
    let earliestKey = null;
    Object.entries(entries).forEach(([k, v]) => {
      if (v && v.actualStart) {
        if (!earliestKey) earliestKey = k;
        else if (parseLocalDate(v.actualStart) < parseLocalDate(entries[earliestKey].actualStart)) earliestKey = k;
      }
    });
    if (!earliestKey) return;

    setMonthlyLogs((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((k) => {
        const shouldBeInitial = k === earliestKey;
        if ((next[k]?.isInitialCycle || false) !== shouldBeInitial) {
          next[k] = { ...next[k], isInitialCycle: shouldBeInitial };
          if (shouldBeInitial) {
            next[k].predictedStart = null;
            next[k].predictedEnd = null;
          }
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    // Update firstEntryDate to earliest actual start if necessary
    const earliestStart = entries[earliestKey].actualStart;
    if (earliestStart && (!firstEntryDate || parseLocalDate(earliestStart) < parseLocalDate(firstEntryDate))) {
      setFirstEntryDate(earliestStart);
    }
  }, [monthlyLogs]);

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
      // Support both DD/MM/YYYY and MM/DD/YYYY. If the first part is >12
      // assume DD/MM/YYYY (common in many locales). Otherwise prefer DD/MM/YYYY
      // to match user expectations.
      const parts = dateString.split('/').map(Number);
      if (parts[0] > 12) {
        // DD/MM/YYYY
        day = parts[0];
        month = parts[1] - 1;
        year = parts[2];
      } else if (parts[1] > 12) {
        // MM/DD/YYYY
        month = parts[0] - 1;
        day = parts[1];
        year = parts[2];
      } else {
        // Ambiguous (e.g., 05/06/2025) — assume DD/MM/YYYY
        day = parts[0];
        month = parts[1] - 1;
        year = parts[2];
      }
    } else {
      return null;
    }
    // Create date at midnight local time
    return new Date(year, month, day, 0, 0, 0, 0);
  };

  // Normalize various date inputs into YYYY-MM-DD strings for consistent storage
  const toYMD = (dateString) => {
    if (!dateString) return null;
    if (dateString.includes('-')) {
      const parts = dateString.split('-');
      if (parts[0].length === 4) return dateString; // already YYYY-MM-DD
      // possibly DD-MM-YYYY
      if (parts[2] && parts[2].length === 4) {
        const [d, m, y] = parts.map(Number);
        return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      }
    }
    if (dateString.includes('/')) {
      const p = dateString.split('/').map(Number);
      // DD/MM/YYYY vs MM/DD/YYYY: prefer DD/MM/YYYY when ambiguous
      if (p[0] > 12) {
        // DD/MM/YYYY
        return `${p[2]}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`;
      }
      if (p[1] > 12) {
        // MM/DD/YYYY
        return `${p[2]}-${String(p[0]).padStart(2,'0')}-${String(p[1]).padStart(2,'0')}`;
      }
      // ambiguous -> DD/MM/YYYY
      return `${p[2]}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`;
    }
    return null;
  };

  const findBaseFromMonthlyLogs = (dateObj) => {
    if (!monthlyLogs) return null;
    const candidates = [];
    Object.values(monthlyLogs).forEach((e) => {
      if (!e) return;
      if (e.actualStart) {
        const d = parseLocalDate(e.actualStart);
        if (d && d <= dateObj) candidates.push({ date: d, startStr: e.actualStart, type: 'actual' });
      }
      if (e.predictedStart) {
        const d = parseLocalDate(e.predictedStart);
        if (d && d <= dateObj) candidates.push({ date: d, startStr: e.predictedStart, type: 'predicted' });
      }
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.date - a.date); // latest first
    return candidates[0];
  };

  // Use shared utility for phase computation so dashboard and tracker stay consistent
  const phaseForDate = (dateObj) => {
    if (!dateObj) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const key = `${year}-${month}-${day}`;

    // 1) Preferred source: predictedPhaseMap (calendar's authoritative per-day predictions)
    if (predictedPhaseMap && predictedPhaseMap[key]) return predictedPhaseMap[key].phaseCode;

    // 2) Fallback: monthlyLogs' actual period ranges
    // If calendar doesn't have the predicted mapping for this day, fall back to computePhaseForDate
    const res = computePhaseForDate(dateObj, monthlyLogs, getSourceCycle());
    return res ? res.phase : null;
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

  // Data points: points are earned only from per-day entries (survey gives zero points)
  const dayEntriesCount = Object.keys(dayEntries || {}).length;
  const dataPointsCount = dayEntriesCount;

  // Generate friendly survey-driven insights (explanatory only)
  const generateSurveyInsights = (results) => {
    if (!results || !results.answers) return null;
    const a = results.answers;
    const notes = [];

    if (a.stress) {
      if (a.stress === 'high') notes.push('High stress levels can make your cycles less regular and may worsen symptoms — consider stress-reduction like walks, short breaks, or sleep hygiene.');
      else if (a.stress === 'medium') notes.push('Moderate stress can subtly affect cycle regularity; keeping an eye on stress and self-care may help.');
      else notes.push('Low stress is great — it supports more regular cycles.');
    }

    if (a.sleep_hours) {
      const hrs = Number(a.sleep_hours) || 0;
      if (hrs <= 5) notes.push('Short sleep (≤5h) can impact hormones and make symptoms worse — try to prioritize restful sleep.');
      else if (hrs <= 7) notes.push('Sleep could be improved; aim for consistent, restorative sleep where possible.');
    }

    if (a.exercise) {
      if (a.exercise === 'never' || a.exercise === 'rarely') notes.push('Less physical activity may be linked to symptom burden; light, regular movement can help mood and cycles.');
    }

    if (a.pms_severity) {
      if (a.pms_severity === 'severe') notes.push('Severe PMS suggests you might benefit from tracking symptoms closely and discussing options with a provider if it impacts daily life.');
      else if (a.pms_severity === 'moderate') notes.push('Moderate PMS is common; tracking helps identify patterns and triggers.');
    }

    if (a.fatigue === 'yes') notes.push('Feeling unusually fatigued may relate to sleep, stress, or other health factors — logging energy and sleep together can reveal patterns.');

    if (a.acne === 'yes') notes.push('Recent acne can be an influence for some cycle-related conditions; keep an eye on patterns across cycles.');

    if (!notes.length) return ['Thanks — your survey results look within common ranges. Continue tracking for clearer insights.'];
    return notes;
  };

  // Determine whether the user has provided any input at all
  const profileCount = [userProfile?.height, userProfile?.weight, userProfile?.age].filter(Boolean).length;
  const hasAnyInput = uploadedData.length > 0 || dayEntriesCount > 0 || !!(cycleData && cycleData.lastPeriodDate) || profileCount > 0;

  // Status: only show when survey results exist; otherwise show empty
  const displayStatus = surveyResults && surveyResults.prediction ? (surveyResults.prediction.includes('Possible') ? 'Imbalanced' : 'Balanced') : '';

  // Cycle regularity: compute only when user has input
  let cycleRegularityPercent = null;
  if (hasAnyInput) {
    if (cycleData && cycleData.cycleLength) {
      const cl = Number(cycleData.cycleLength);
      cycleRegularityPercent = (cl >= 24 && cl <= 35) ? 95 : 40;
    } else {
      cycleRegularityPercent = null;
    }
  }

  // Symptom severity: compute only when user has input
  let symptomSeverityPercent = null;
  if (hasAnyInput) {
    if (dayEntriesCount > 0) {
      const totalSymptoms = Object.values(dayEntries).reduce((sum, e) => sum + ((e.symptoms || []).length), 0);
      const avgSymptoms = totalSymptoms / dayEntriesCount; // average per entry
      symptomSeverityPercent = Math.min(100, Math.round((avgSymptoms / 6) * 100));
    } else {
      symptomSeverityPercent = null;
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

    dataCompletenessPercent = Math.min(100, dataCompletenessPercent);
  }

  const { setMlPrediction, setUserFeatures } = useMLPrediction();

  // Calculate ML prediction
  // Derive cycle statistics from `monthlyLogs` when available (prefer actuals over predicted)
  const deriveCycleFromLogs = (logs) => {
    if (!logs) return null;
    const entries = Object.values(logs).filter(e => e && e.actualStart).map(e => ({ start: e.actualStart, end: e.actualEnd }));
    if (!entries.length) return null;
    // Sort by start date ascending
    entries.sort((a,b) => (a.start < b.start ? -1 : 1));
    // Compute cycle lengths as days between consecutive starts
    const starts = entries.map(e => parseLocalDate(e.start)).filter(Boolean);
    const cycleLens = [];
    for (let i = 1; i < starts.length; i++) {
      const dsp = Math.round((starts[i] - starts[i-1]) / (1000*60*60*24));
      if (dsp > 0) cycleLens.push(dsp);
    }
    const avgCycle = cycleLens.length ? Math.round(cycleLens.reduce((s,v) => s+v,0) / cycleLens.length) : null;
    // period lengths from start/end
    const periodLens = entries.map(e => {
      if (!e.end) return null;
      const s = parseLocalDate(e.start);
      const t = parseLocalDate(e.end);
      if (!s || !t) return null;
      return Math.round((t - s) / (1000*60*60*24)) + 1;
    }).filter(Boolean);
    const avgPeriod = periodLens.length ? Math.round(periodLens.reduce((s,v) => s+v,0) / periodLens.length) : null;
    const irregular = cycleLens.length ? (Math.max(...cycleLens) - Math.min(...cycleLens) > 7) : false;
    return {
      derivedCycleLength: avgCycle,
      derivedPeriodLength: avgPeriod,
      irregular,
      recentEntries: entries,
    };
  };

  const mlPrediction = useMemo(() => {
    // require either survey or some tracker/logs data
    if (!surveyResults && !cycleData?.lastPeriodDate && (!monthlyLogs || Object.keys(monthlyLogs).length === 0)) {
      return null;
    }

    const derived = deriveCycleFromLogs(monthlyLogs);
    // Build an enriched cycleData object to prefer measured values when available
    const enrichedCycleData = { ...cycleData };
    if (derived) {
      if (derived.derivedCycleLength) enrichedCycleData.cycleLength = derived.derivedCycleLength;
      if (derived.derivedPeriodLength) enrichedCycleData.periodLength = derived.derivedPeriodLength;
    }

    const features = mapUserDataToFeatures(surveyResults, enrichedCycleData, dayEntries, userProfile, monthlyLogs);
    const pred = predictPCOS(features);
    // Attach logs-derived summary into prediction for transparency
    pred.logsSummary = derived;
    return pred;
  }, [surveyResults, cycleData, dayEntries, userProfile, monthlyLogs]);

  // Update context when prediction changes
  useEffect(() => {
    if (mlPrediction) {
      setMlPrediction(mlPrediction);
      setUserFeatures(mlPrediction.features);
    }
  }, [mlPrediction, setMlPrediction, setUserFeatures]);

  // Rebuild predicted per-day phase map whenever monthly logs, cycle settings, or firstEntryDate change
  useEffect(() => {
    const baseStart = getSourceCycle()?.startDate || firstEntryDate;
    if (!baseStart) return;
    const cycleLen = cycleData?.cycleLength ? Number(cycleData.cycleLength) : 28;
    const periodLen = cycleData?.periodLength ? Number(cycleData.periodLength) : 5;
    const startMonthIndex = parseLocalDate(firstEntryDate || baseStart).getFullYear() * 12 + parseLocalDate(firstEntryDate || baseStart).getMonth();
    const now = new Date();
    const endMonthIndex = now.getFullYear() * 12 + now.getMonth();
    const pm = computePredictedMap(baseStart, cycleLen, periodLen, startMonthIndex, endMonthIndex);
    buildPredictedPhaseMap(pm, cycleLen, periodLen, startMonthIndex, endMonthIndex);
  }, [monthlyLogs, cycleData, firstEntryDate]);

  // Compute widget metrics from combined sources (survey OR tracker)
  const sourceCycle = getSourceCycle();

  // Build per-day predicted phase map from monthly logs and calendar predictions
  const buildPredictedPhaseMap = (predictedMap, cycleLen, periodLen, startMonthIndex, endMonthIndex) => {

    // `predictedMap` is a month-key -> { predictedStart, predictedEnd }
    const out = {};
    if (!predictedMap || !cycleLen) {
      setPredictedPhaseMap({});
      return;
    }

    // Gather start dates from predictedMap; also include actual starts where present in monthlyLogs to prefer those
    const starts = [];
    Object.entries(predictedMap).forEach(([monthKey, p]) => {
      if (!p) return;
      if (p.predictedStart) {
        starts.push({ date: parseLocalDate(p.predictedStart), startStr: p.predictedStart, type: 'predicted' });
      }
    });

    // also include actual starts from monthlyLogs (they should override predicted ranges)
    Object.values(monthlyLogs || {}).forEach((e) => {
      if (!e) return;
      if (e.actualStart) starts.push({ date: parseLocalDate(e.actualStart), startStr: e.actualStart, type: 'actual', entry: e });
    });

    starts.sort((a, b) => a.date - b.date);

    // compute an upper bound for the map
    const firstStart = starts.length ? starts[0].date : parseLocalDate(firstEntryDate || new Date().toISOString().split('T')[0]);
    const now = new Date();
    const endMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonthIdx = endMonthIndex || (endMonthDate.getFullYear() * 12 + endMonthDate.getMonth());

    // We'll project cycles forward from earliest start up to endMonthIdx + 1 month for safety
    const projectedEnd = new Date(endMonthDate.getFullYear(), endMonthDate.getMonth() + 1, 0);

    // Build cycles: iterate cycles starting at earliest start
    let cursor = new Date(firstStart.getFullYear(), firstStart.getMonth(), firstStart.getDate());
    let cycleIndex = 0;
    while (cursor <= projectedEnd && cycleIndex < 500) {
      // For each day in the cycle, determine phase
      for (let d = 0; d < cycleLen; d++) {
        const dayDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + d);
        const y = dayDate.getFullYear();
        const m = String(dayDate.getMonth() + 1).padStart(2, '0');
        const dd = String(dayDate.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${dd}`;

        // Check for explicit actuals covering this day (from monthlyLogs)
        let forcedActual = null;
        Object.values(monthlyLogs || {}).forEach((ent) => {
          if (ent && ent.actualStart && ent.actualEnd) {
            const s = parseLocalDate(ent.actualStart);
            const e = parseLocalDate(ent.actualEnd);
            if (s && e && dayDate >= s && dayDate <= e) forcedActual = { s, e };
          } else if (ent && ent.actualStart && !ent.actualEnd) {
            // User entered only a start date — treat that single day as authoritative period day
            const s = parseLocalDate(ent.actualStart);
            if (s && dayDate.getFullYear() === s.getFullYear() && dayDate.getMonth() === s.getMonth() && dayDate.getDate() === s.getDate()) {
              forcedActual = { s, e: s };
            }
          }
        });

        let phaseCode = null;
        if (forcedActual) {
          phaseCode = 'menstruation';
        } else {
          const dayInCycle = d + 1; // 1-indexed
          if (dayInCycle <= periodLen) phaseCode = 'menstruation';
          else if (dayInCycle <= 13) phaseCode = 'follicular';
          else if (dayInCycle <= 16) phaseCode = 'ovulation';
          else phaseCode = 'luteal';
        }

        out[key] = { phaseCode, phaseLabel: phaseCode === 'menstruation' ? 'Period' : phaseCode.charAt(0).toUpperCase() + phaseCode.slice(1), dayInCycle: d + 1 };
      }

      // advance cursor by cycleLen days
      cursor.setDate(cursor.getDate() + cycleLen);
      cycleIndex += 1;
    }

    setPredictedPhaseMap(out);
  };

  // Current phase using logged data/calendar logic — ONLY if user has entered data
  const today = new Date();
  // Treat either tracker start or monthly logs (actual/predicted) as user data for phase computation
  const hasUserData = !!((sourceCycle && sourceCycle.startDate) || (monthlyLogs && Object.values(monthlyLogs).some((v) => v && (v.actualStart || v.predictedStart))));
  const rawPhase = hasUserData ? phaseForDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0)) : null;
  const phaseLabelMap = {
    menstruation: 'Period',
    follicular: 'Follicular',
    ovulation: 'Ovulation',
    luteal: 'Luteal',
  };
  const currentPhaseLabel = rawPhase ? (phaseLabelMap[rawPhase] || String(rawPhase)) : '—';

  // Day of cycle (calculate from startDate, tracker or monthly logs as available)
  let dayOfCycle = null;
  // Prefer predictedPhaseMap if it contains today
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (predictedPhaseMap && predictedPhaseMap[todayKey]) {
    dayOfCycle = predictedPhaseMap[todayKey].dayInCycle;
  } else {
    // compute base start from tracker first, then monthly logs
    let baseStartStr = sourceCycle && sourceCycle.startDate ? sourceCycle.startDate : null;
    if (!baseStartStr) {
      const base = findBaseFromMonthlyLogs(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0));
      if (base) baseStartStr = base.startStr;
    }
    if (baseStartStr) {
      const start = parseLocalDate(baseStartStr);
      if (start) {
        const diffDays = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate(),0,0,0,0) - start) / (1000 * 60 * 60 * 24));
        const derived = deriveCycleFromLogs(monthlyLogs);
        const cycleLen = (sourceCycle && sourceCycle.cycleLength) ? Math.max(1, Number(sourceCycle.cycleLength)) : (derived?.derivedCycleLength || 28);
        dayOfCycle = (((diffDays % cycleLen) + cycleLen) % cycleLen) + 1; // 1-indexed
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

    // Also build the per-day predicted phase map to be authoritative for the calendar and widgets
    buildPredictedPhaseMap(predictedMap, cycleLen, periodLen, startMonthIndex, endMonthIndex);


    setMonthlyLogs((prev) => {
      const next = { ...prev };

      for (let m = startMonthIndex; m <= endMonthIndex; m++) {
        const year = Math.floor(m / 12);
        const month = m % 12;
        const monthDate = new Date(year, month, 1);
        const key = monthKeyFromDate(monthDate);

        if (!next[key]) next[key] = { predictedStart: null, predictedEnd: null, actualStart: null, actualEnd: null, createdAt: new Date().toISOString() };

        // Only write predicted values into empty months that don't have actuals
        // or are not the immutable initial cycle.
        if (predictedMap[key] && !next[key].actualStart && !next[key].isInitialCycle) {
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

    // Build per-day predicted phase map so widgets read the same authoritative predictions
    buildPredictedPhaseMap(predictedMap, cycleLen, periodLen, startMonthIndex, endMonthIndex);
  };

  const recordActualPeriod = (actualStartStr, actualEndStr) => {
    // Prefer user-supplied inputs (from logs UI) and normalize; fall back to tracker/survey source only when missing
    const src = getSourceCycle();
    const finalStart = toYMD(actualStartStr) || actualStartStr || (src && src.startDate) || null;
    const finalEnd = toYMD(actualEndStr) || actualEndStr || (src && src.periodEndDate) || null;
    if (!finalStart) return;
    const actualDate = parseLocalDate(finalStart);
    if (!actualDate) return;
    // Mark first entry date if this is the earliest actual we have
    if (!firstEntryDate) setFirstEntryDate(finalStart);
    const key = monthKeyFromDate(actualDate);
    setMonthlyLogs((prev) => {
      const next = { ...prev };
      const hasAnyActual = Object.values(prev || {}).some((v) => v && v.actualStart);

      // Always set the month's actuals to reflect the user's submitted values (normalize), overriding prior incorrect data
      const normalizedStart = toYMD(actualStartStr) || actualStartStr || (src && src.startDate) || null;
      const normalizedEnd = toYMD(actualEndStr) || actualEndStr || (src && src.periodEndDate) || null;

      if (!next[key]) next[key] = { predictedStart: null, predictedEnd: null, actualStart: null, actualEnd: null, createdAt: new Date().toISOString() };
      next[key].actualStart = normalizedStart;
      next[key].actualEnd = normalizedEnd;
      if (!hasAnyActual) next[key].isInitialCycle = true;

      return next;
    });

    // After recording a new actual, populate predicted months using calendar base
    const baseStart = getSourceCycle()?.startDate || actualStartStr;
    const cycleLen = cycleData?.cycleLength ? Number(cycleData.cycleLength) : 28;
    const periodLen = cycleData?.periodLength ? Number(cycleData.periodLength) : 5;
    ensurePredictedLogs(baseStart, cycleLen, periodLen);

    // Rebuild the predicted phase map so the calendar and Current Phase reflect the update
    const now = new Date();
    const startMonthIndex = parseLocalDate(firstEntryDate || baseStart).getFullYear() * 12 + parseLocalDate(firstEntryDate || baseStart).getMonth();
    const endMonthIndex = now.getFullYear() * 12 + now.getMonth();
    const pm = computePredictedMap(baseStart, cycleLen, periodLen, startMonthIndex, endMonthIndex);
    buildPredictedPhaseMap(pm, cycleLen, periodLen, startMonthIndex, endMonthIndex);
  };

  // Explicit update when user edits actuals from the UI
  const updateActualPeriod = (monthKey, actualStartStr, actualEndStr) => {
    setMonthlyLogs((prev) => {
      const next = { ...prev };
      if (!next[monthKey]) {
        // create a new slot if missing
        next[monthKey] = { predictedStart: null, predictedEnd: null, actualStart: toYMD(actualStartStr) || null, actualEnd: toYMD(actualEndStr) || null, createdAt: new Date().toISOString() };
      } else {
        next[monthKey] = { ...next[monthKey], actualStart: toYMD(actualStartStr) || null, actualEnd: toYMD(actualEndStr) || null };
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

  // Derive the most recent actual period end (or start if no end) from monthly logs
  const lastActualFromLogs = useMemo(() => {
    const entries = Object.values(monthlyLogs || {});
    let latest = null;
    entries.forEach((e) => {
      if (!e || !e.actualStart) return;
      const lastYMD = e.actualEnd || e.actualStart;
      const d = parseLocalDate(lastYMD);
      if (!d) return;
      if (!latest || d > latest.date) {
        latest = { date: d, ymd: lastYMD, start: e.actualStart, end: e.actualEnd };
      }
    });
    return latest;
  }, [monthlyLogs]);

  const lastActualLength = useMemo(() => {
    if (!lastActualFromLogs) return null;
    if (lastActualFromLogs.start && lastActualFromLogs.end) {
      const s = parseLocalDate(lastActualFromLogs.start);
      const e = parseLocalDate(lastActualFromLogs.end);
      if (s && e) return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    }
    return null;
  }, [lastActualFromLogs]);

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
                  <div className="summary-value">{formatLocalFromYMD(lastActualFromLogs?.ymd || getSourceCycle()?.startDate)}</div>
                  <div className="summary-meta">Length {lastActualLength || getSourceCycle()?.periodLength || getSourceCycle()?.cycleLength || '–'} days</div>
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


            </div>

            <div className="tracker-top-right">
                <div className="card">
                <h4>Survey</h4>
                <SurveyTab existingResult={surveyResults} onComplete={(results) => setSurveyResults(results)} onReset={() => setSurveyResults(null)} />
              </div>
              {surveyResults ? (
                <div className="survey-cta" style={{ marginTop: 12 }}>
                  <div className="cta-text">Go here to see your results!</div>
                  <div style={{ marginTop: 0 }}>
                    <button className="btn small" onClick={() => setActiveTab('dataset')}>View AI Insights →</button>
                  </div>
                </div>
              ) : null}
              {/* Survey insights summary intentionally omitted from Cycle & Tracker — detailed view lives in AI Insights tab */}
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
                  predictedPhaseMap={predictedPhaseMap}
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
                      {mlPrediction.logsSummary && (
                        <div className="logs-summary-card">
                          <div className="logs-summary-title">Cycle Logs Summary</div>
                          <div className="logs-summary-body">
                            <div>Cycles analysed: {mlPrediction.logsSummary.recentEntries.length}</div>
                            <div>Avg cycle length: {mlPrediction.logsSummary.derivedCycleLength || '—'} days</div>
                            <div>Avg period length: {mlPrediction.logsSummary.derivedPeriodLength || '—'} days</div>
                            <div>Variability: {mlPrediction.logsSummary.irregular ? 'Irregular' : 'Stable'}</div>
                          </div>
                        </div>
                      )}
                    {surveyResults && (() => {
                      const lines = generateSurveyInsights(surveyResults) || [];
                      const a = surveyResults.answers || {};
                      const severity = (a.pms_severity === 'severe' || a.regularity === 'irregular' || (Number(a.cycle_length) >= 35 && a.acne === 'yes')) ? 'high' : (a.pms_severity === 'moderate' || (a.sleep_hours && Number(a.sleep_hours) <= 6) || a.stress === 'high' || a.fatigue === 'yes') ? 'medium' : 'low';
                      return (
                        <div className={`survey-insights-section ${severity}`} style={{ margin: '12px 0' }}>
                          <div className="insights-header">
                            <div className="insights-icon">{severity === 'high' ? '⚠️' : (severity === 'medium' ? '💡' : '✅')}</div>
                            <div className="insights-title">
                              <h4>Your Cycle Insights</h4>
                              <div className="insights-badge">{severity === 'high' ? 'Attention' : (severity === 'medium' ? 'Watch' : 'Healthy')}</div>
                            </div>
                          </div>
                          <ul className="insights-list" style={{ marginTop: 10, paddingLeft: 18 }}>
                            {lines.map((line, idx) => (
                              <li key={idx} className="insight-item">{line}</li>
                            ))}
                          </ul>
                          <div className="insights-actions">
                            <button className="btn small secondary" onClick={() => setActiveTab('logs')}>Log period</button>
                            <button className="btn small" onClick={() => setActiveTab('tracker')}>Open tracker</button>
                          </div>
                        </div>
                      );
                    })()}
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
            {cycleData?.lastPeriodDate && (
              <div className="visualizations-section">
                <h3>📊 Cycle Phase Visualizations</h3>
                <CycleVisualizations 
                  cycleData={cycleData} 
                  surveyResults={null} 
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
              <p className="muted">Monthly predicted vs actual tracking!</p>
              <MonthlyLogs monthlyLogs={monthlyLogs} onLogActual={(k,s,e) => recordActualPeriod(s,e)} onUpdateActual={(k,s,e) => updateActualPeriod(k,s,e)} onOpenLog={(k) => openTrackerForMonth(k)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
