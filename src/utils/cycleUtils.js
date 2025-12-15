// Utilities for computing cycle phase and day-of-cycle based on monthly logs or tracker data
export const parseYMD = (ymd) => {
  if (!ymd) return null;
  if (typeof ymd !== 'string') return null;
  if (ymd.includes('-')) {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const d = new Date(ymd);
  return isNaN(d.getTime()) ? null : d;
};

const findBaseFromMonthlyLogs = (dateObj, monthlyLogs) => {
  if (!monthlyLogs) return null;
  const candidates = [];
  Object.values(monthlyLogs).forEach((e) => {
    if (!e) return;
    if (e.actualStart) {
      const d = parseYMD(e.actualStart);
      if (d && d <= dateObj) candidates.push({ date: d, startStr: e.actualStart, entry: e, type: 'actual' });
    }
    if (e.predictedStart) {
      const d = parseYMD(e.predictedStart);
      if (d && d <= dateObj) candidates.push({ date: d, startStr: e.predictedStart, entry: e, type: 'predicted' });
    }
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.date - a.date); // latest first
  return candidates[0];
};

const deriveCycleFromMonthlyLogs = (monthlyLogs) => {
  if (!monthlyLogs) return null;
  const entries = Object.values(monthlyLogs).filter(e => e && e.actualStart).map(e => ({ start: e.actualStart, end: e.actualEnd }));
  if (!entries.length) return null;
  entries.sort((a, b) => (a.start < b.start ? -1 : 1));
  const starts = entries.map(e => parseYMD(e.start)).filter(Boolean);
  const cycleLens = [];
  for (let i = 1; i < starts.length; i++) {
    const dsp = Math.round((starts[i] - starts[i - 1]) / (1000 * 60 * 60 * 24));
    if (dsp > 0) cycleLens.push(dsp);
  }
  const avgCycle = cycleLens.length ? Math.round(cycleLens.reduce((s, v) => s + v, 0) / cycleLens.length) : null;
  // period lengths
  const periodLens = entries.map(e => {
    if (!e.end) return null;
    const s = parseYMD(e.start);
    const t = parseYMD(e.end);
    if (!s || !t) return null;
    return Math.round((t - s) / (1000 * 60 * 60 * 24)) + 1;
  }).filter(Boolean);
  const avgPeriod = periodLens.length ? Math.round(periodLens.reduce((s, v) => s + v, 0) / periodLens.length) : null;
  return { avgCycle, avgPeriod };
};

// Compute canonical phase code for a given date using monthly logs and/or cycleData
export const computePhaseForDate = (dateObj, monthlyLogs, cycleData) => {
  if (!dateObj) return null;

  // First try tracker cycleData (explicit start and optional end)
  if (cycleData && cycleData.lastPeriodDate) {
    const start = parseYMD(cycleData.lastPeriodDate);
    const end = cycleData.periodEndDate ? parseYMD(cycleData.periodEndDate) : null;
    if (start) {
      const cycleLen = (cycleData.cycleLength && Number(cycleData.cycleLength)) ? Number(cycleData.cycleLength) : null;
      const periodLen = (cycleData.periodLength && Number(cycleData.periodLength)) ? Number(cycleData.periodLength) : null;
      const check = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0);
      // If within explicit actual range
      if (end && check >= start && check <= end) return { phase: 'menstruation', dayInCycle: Math.floor((check - start) / (1000 * 60 * 60 * 24)) + 1, cycleLen, periodLen };
      if (!cycleLen) return null; // cannot compute otherwise
      const diff = Math.floor((check - start) / (1000 * 60 * 60 * 24));
      if (diff < 0) return null;
      const dayInCycle = (diff % cycleLen) + 1;
      // NOTE: Do NOT use `periodLen` to infer an explicit menstruation window for tracker-entered dates
      // when the user did not provide an explicit end date. Period length is prediction-only.
      if (dayInCycle <= 13) return { phase: 'follicular', dayInCycle, cycleLen, periodLen };
      if (dayInCycle <= 16) return { phase: 'ovulation', dayInCycle, cycleLen, periodLen };
      return { phase: 'luteal', dayInCycle, cycleLen, periodLen };
    }
  }

  // Fallback: look for base start in monthlyLogs (prefer actual over predicted)
  const base = findBaseFromMonthlyLogs(dateObj, monthlyLogs);
  if (!base) return null;
  const baseStart = parseYMD(base.startStr);
  if (!baseStart) return null;

  // If base entry has explicit actual range, respect it
  if (base.entry && base.entry.actualStart && base.entry.actualEnd) {
    const s = parseYMD(base.entry.actualStart);
    const e = parseYMD(base.entry.actualEnd);
    if (s && e && dateObj >= s && dateObj <= e) {
      const dayInCycle = Math.floor((dateObj - s) / (1000 * 60 * 60 * 24)) + 1;
      // derive cycleLen/periodLen from logs if possible
      const derived = deriveCycleFromMonthlyLogs(monthlyLogs) || {};
      const cycleLen = derived.avgCycle || 28;
      const periodLen = derived.avgPeriod || 5;
      return { phase: 'menstruation', dayInCycle, cycleLen, periodLen };
    }
  }

  // If only an actualStart exists (user entered a start but no end), treat only that single day as authoritative menstruation
  if (base.entry && base.entry.actualStart && !base.entry.actualEnd) {
    const s = parseYMD(base.entry.actualStart);
    if (s && dateObj.getFullYear() === s.getFullYear() && dateObj.getMonth() === s.getMonth() && dateObj.getDate() === s.getDate()) {
      return { phase: 'menstruation', dayInCycle: 1 };
    }
  }

  // Derive cycle/period lengths from monthly logs if possible
  const derived = deriveCycleFromMonthlyLogs(monthlyLogs) || {};
  const cycleLen = (cycleData && cycleData.cycleLength) ? Number(cycleData.cycleLength) : (derived.avgCycle || 28);
  const periodLen = (cycleData && cycleData.periodLength) ? Number(cycleData.periodLength) : (derived.avgPeriod || 5);

  const diff = Math.floor((dateObj - baseStart) / (1000 * 60 * 60 * 24));
  if (diff < 0) return null;
  const dayInCycle = (diff % cycleLen) + 1;
  if (dayInCycle <= periodLen) return { phase: 'menstruation', dayInCycle, cycleLen, periodLen };
  if (dayInCycle <= 13) return { phase: 'follicular', dayInCycle, cycleLen, periodLen };
  if (dayInCycle <= 16) return { phase: 'ovulation', dayInCycle, cycleLen, periodLen };
  return { phase: 'luteal', dayInCycle, cycleLen, periodLen };
};
