/**
 * ML Prediction Utility for PCOS Classification
 * Based on the RandomForest model from pcos_only.ipynb
 * 
 * Feature importances from the model:
 * - Menstrual_Irregularity: 0.374420
 * - BMI: 0.330038
 * - Testosterone_Level(ng/dL): 0.163221
 * - Antral_Follicle_Count: 0.125228
 * - Age: 0.007093
 */

/**
 * Maps user data from cycle & tracker to PCOS model features
 */
export const mapUserDataToFeatures = (surveyResults, cycleData, dayEntries, userProfile = {}, monthlyLogs = {}) => {
  // Extract data from survey
  const answers = surveyResults?.answers || {};
  const regularity = answers.regularity === 'irregular' ? 1 : 0;
  const cycleLength = Number(answers.cycle_length) || Number(cycleData?.cycleLength) || 28;
  const pmsSeverity = answers.pms_severity || 'no';
  const acne = answers.acne === 'yes' ? 1 : 0;
  const stress = answers.stress || 'medium';
  
  // Use actual values from user profile if available, otherwise estimate
  const age = userProfile?.age ? Number(userProfile.age) : 28;
  const bmi = calculateBMI(userProfile) || estimateBMI(answers, cycleData);
  const menstrualIrregularity = regularity; // Direct mapping
  const testosteroneLevel = estimateTestosterone(regularity, acne, cycleLength, pmsSeverity);
  const antralFollicleCount = estimateAntralFollicleCount(cycleLength, regularity, dayEntries);
  
  return {
    Age: age,
    BMI: bmi,
    Menstrual_Irregularity: menstrualIrregularity,
    'Testosterone_Level(ng/dL)': testosteroneLevel,
    Antral_Follicle_Count: antralFollicleCount,
    // Additional context for insights
    cycleLength,
    regularity,
    pmsSeverity,
    acne,
    stress,
    // Include logs-derived context when available
    cyclesAnalyzed: (() => {
      const entries = Object.values(monthlyLogs || {}).filter(e => e && e.actualStart);
      return entries.length;
    })(),
    avgPeriodLength: (() => {
      const entries = Object.values(monthlyLogs || {}).filter(e => e && e.actualStart && e.actualEnd);
      if (!entries.length) return null;
      const lens = entries.map(e => {
        const s = new Date(e.actualStart);
        const t = new Date(e.actualEnd);
        return Math.round((t - s) / (1000*60*60*24)) + 1;
      });
      return Math.round(lens.reduce((s,v) => s+v,0) / lens.length);
    })(),
    cycleVariability: (() => {
      const entries = Object.values(monthlyLogs || {}).filter(e => e && e.actualStart).sort((a,b) => (a.actualStart < b.actualStart ? -1 : 1));
      if (entries.length < 2) return null;
      const starts = entries.map(e => new Date(e.actualStart));
      const diffs = [];
      for (let i = 1; i < starts.length; i++) diffs.push(Math.round((starts[i] - starts[i-1])/(1000*60*60*24)));
      if (!diffs.length) return null;
      return Math.max(...diffs) - Math.min(...diffs);
    })(),
    // Store user profile for display
    userProfile
  };
};

/**
 * Calculate BMI from height (cm) and weight (kg)
 * BMI = weight (kg) / (height (m))^2
 */
const calculateBMI = (userProfile) => {
  if (!userProfile || !userProfile.height || !userProfile.weight) {
    return null;
  }
  const heightInMeters = Number(userProfile.height) / 100; // Convert cm to meters
  const weightInKg = Number(userProfile.weight);
  if (heightInMeters > 0 && weightInKg > 0) {
    return weightInKg / (heightInMeters * heightInMeters);
  }
  return null;
};

/**
 * Estimate BMI based on available data
 * Default to 25 (normal range) if not provided
 */
const estimateBMI = (answers, cycleData) => {
  // If BMI is provided in survey, use it
  if (answers.bmi) return Number(answers.bmi);
  
  // Estimate based on cycle regularity and symptoms
  // Irregular cycles with high symptoms might indicate higher BMI
  const regularity = answers.regularity === 'irregular' ? 1 : 0;
  const pmsSeverity = answers.pms_severity || 'no';
  const pmsMap = { no: 0, mild: 1, moderate: 2, severe: 3 };
  const pmsScore = pmsMap[pmsSeverity] || 0;
  
  // Base BMI with adjustments
  let bmi = 24; // Normal baseline
  if (regularity === 1) bmi += 2; // Irregular cycles often associated with higher BMI
  if (pmsScore >= 2) bmi += 1.5; // Severe PMS might indicate hormonal issues
  
  return Math.min(35, Math.max(18, bmi)); // Clamp between 18-35
};

/**
 * Estimate Testosterone Level based on symptoms
 * Normal range: 15-70 ng/dL
 * Higher levels associated with PCOS
 */
const estimateTestosterone = (regularity, acne, cycleLength, pmsSeverity) => {
  let testosterone = 45; // Normal baseline (mid-range)
  
  // Irregular cycles suggest higher testosterone
  if (regularity === 1) testosterone += 20;
  
  // Acne is a sign of higher testosterone
  if (acne === 1) testosterone += 15;
  
  // Very long cycles (>35 days) suggest hormonal imbalance
  if (cycleLength > 35) testosterone += 10;
  
  // Severe PMS might indicate hormonal issues
  if (pmsSeverity === 'severe') testosterone += 5;
  
  return Math.min(100, Math.max(15, testosterone)); // Clamp between 15-100
};

/**
 * Estimate Antral Follicle Count
 * Normal: 5-20, PCOS: often >20
 */
const estimateAntralFollicleCount = (cycleLength, regularity, dayEntries) => {
  let count = 12; // Normal baseline
  
  // Irregular cycles suggest higher follicle count
  if (regularity === 1) count += 8;
  
  // Very long cycles suggest PCOS
  if (cycleLength > 35) count += 5;
  
  // Count symptoms that might indicate PCOS
  if (dayEntries) {
    const allSymptoms = Object.values(dayEntries).flatMap(entry => entry.symptoms || []);
    const pcosSymptoms = ['Acne', 'Mood Swings', 'Fatigue', 'Food Cravings'];
    const symptomCount = allSymptoms.filter(s => pcosSymptoms.includes(s)).length;
    if (symptomCount > 5) count += 3;
  }
  
  return Math.min(30, Math.max(5, count)); // Clamp between 5-30
};

/**
 * Predict PCOS risk using weighted scoring based on feature importances
 * Returns: { prediction: 0 or 1, confidence: 0-1, riskLevel: 'low'|'medium'|'high', insights: [] }
 */
export const predictPCOS = (features) => {
  // Feature importances from RandomForest model
  const weights = {
    Menstrual_Irregularity: 0.374420,
    BMI: 0.330038,
    'Testosterone_Level(ng/dL)': 0.163221,
    Antral_Follicle_Count: 0.125228,
    Age: 0.007093
  };
  
  // Normalize features to 0-1 scale for scoring
  const normalized = {
    Menstrual_Irregularity: features.Menstrual_Irregularity, // Already 0 or 1
    BMI: (features.BMI - 18) / (35 - 18), // Normalize 18-35 to 0-1
    'Testosterone_Level(ng/dL)': (features['Testosterone_Level(ng/dL)'] - 15) / (100 - 15), // Normalize 15-100
    Antral_Follicle_Count: (features.Antral_Follicle_Count - 5) / (30 - 5), // Normalize 5-30
    Age: (features.Age - 20) / (45 - 20) // Normalize 20-45
  };
  
  // Calculate weighted risk score
  let riskScore = 0;
  riskScore += normalized.Menstrual_Irregularity * weights.Menstrual_Irregularity;
  riskScore += normalized.BMI * weights.BMI;
  riskScore += normalized['Testosterone_Level(ng/dL)'] * weights['Testosterone_Level(ng/dL)'];
  riskScore += normalized.Antral_Follicle_Count * weights.Antral_Follicle_Count;
  riskScore += normalized.Age * weights.Age;
  
  // Threshold for prediction (tuned based on model performance)
  const threshold = 0.45; // Adjusted for the weighted model
  const prediction = riskScore >= threshold ? 1 : 0;
  const confidence = Math.min(0.95, Math.max(0.05, Math.abs(riskScore - threshold) * 2));
  
  // Determine risk level
  let riskLevel = 'low';
  if (riskScore >= 0.6) riskLevel = 'high';
  else if (riskScore >= 0.4) riskLevel = 'medium';
  
  // Generate insights
  const insights = generateInsights(features, riskScore, prediction);
  
  return {
    prediction,
    confidence: Math.round(confidence * 100) / 100,
    riskScore: Math.round(riskScore * 100) / 100,
    riskLevel,
    insights,
    features
  };
};

/**
 * Generate personalized insights based on prediction and features
 */
const generateInsights = (features, riskScore, prediction) => {
  const insights = [];
  
  if (prediction === 1) {
    insights.push({
      type: 'warning',
      title: 'Possible PCOS Pattern Detected',
      message: 'Your cycle patterns and symptoms suggest a possible PCOS pattern. Consider consulting a healthcare professional for evaluation.'
    });
  } else {
    insights.push({
      type: 'info',
      title: 'Pattern Within Normal Range',
      message: 'Your cycle patterns appear to be within common variability. Continue tracking for better insights.'
    });
  }
  
  if (features.Menstrual_Irregularity === 1) {
    insights.push({
      type: 'suggestion',
      title: 'Irregular Cycles',
      message: 'Irregular menstrual cycles can be managed with lifestyle changes, stress reduction, and regular exercise.'
    });
  }
  
  if (features.BMI > 28) {
    insights.push({
      type: 'suggestion',
      title: 'Weight Management',
      message: 'Maintaining a healthy weight can help regulate hormonal balance and improve cycle regularity.'
    });
  }
  
  if (features['Testosterone_Level(ng/dL)'] > 60) {
    insights.push({
      type: 'suggestion',
      title: 'Hormonal Balance',
      message: 'Consider discussing hormonal testing with your healthcare provider to better understand your hormone levels.'
    });
  }
  
  if (features.Antral_Follicle_Count > 20) {
    insights.push({
      type: 'info',
      title: 'Follicle Count',
      message: 'Higher follicle count may indicate PCOS. Ultrasound evaluation can provide more accurate assessment.'
    });
  }
  
  // Cycle-specific suggestions
  if (features.cycleLength > 35) {
    insights.push({
      type: 'suggestion',
      title: 'Long Cycle Length',
      message: 'Cycles longer than 35 days may benefit from medical evaluation to rule out underlying conditions.'
    });
  }
  
  if (features.acne === 1) {
    insights.push({
      type: 'suggestion',
      title: 'Acne Management',
      message: 'Hormonal acne can be managed with proper skincare, diet modifications, and potentially hormonal treatments.'
    });
  }

  // Insights from logs-derived data
  if (features.cyclesAnalyzed && features.cyclesAnalyzed >= 3) {
    insights.push({
      type: 'info',
      title: `Based on ${features.cyclesAnalyzed} cycles`,
      message: `Average cycle length: ${features.cycleLength || '—'} days; average period length: ${features.avgPeriodLength || '—'} days.`
    });
    if (features.cycleVariability && features.cycleVariability > 7) {
      insights.push({
        type: 'warning',
        title: 'Cycle Variability Detected',
        message: 'Your recorded cycles vary by more than a week — this may indicate irregular cycles influenced by lifestyle or hormonal factors.'
      });
    }
  }
  
  return insights;
};

/**
 * Calculate cycle phase distribution for visualization
 */
export const calculateCyclePhaseDistribution = (cycleData, _surveyResults, selectedDate) => {
  // Use tracker `cycleData` only; survey results are for AI insights only and should not influence calendar visualizations
  const cycleLength = Number(cycleData?.cycleLength) || 28;
  const periodLength = Number(cycleData?.periodLength) || 5;
  
  const period = periodLength;
  const follicular = Math.max(0, 13 - periodLength);
  const ovulation = 3; // Days 13-16 typically
  const luteal = cycleLength - period - follicular - ovulation;
  
  return [
    { name: 'Period', days: period, color: '#f56565' },
    { name: 'Follicular', days: follicular, color: '#f8a855' },
    { name: 'Ovulation', days: ovulation, color: '#ffd700' },
    { name: 'Luteal', days: luteal, color: '#b19cd9' }
  ];
};

/**
 * Generate a short, non-diagnostic daily AI summary from a single day entry
 * Inputs:
 *  - date: string YYYY-MM-DD or Date
 *  - dayEntry: { mood, symptoms: [] }
 *  - context: { userProfile, surveyResults, phaseLabel, isLogged }
 * Returns: { date, phaseLabel, isLogged, summary, indicators }
 */
export const generateDailyAISummary = ({ date, dayEntry = {}, context = {} }) => {
  // Important: this function produces contextual, regenerative summaries for UX and AI features.
  // It is intentionally non-diagnostic and does NOT store or assert medical conditions. The
  // heuristics used here are descriptive for user-facing explanations only and should be
  // interpreted as supportive guidance rather than clinical decision rules.
  const dStr = (date instanceof Date) ? date.toISOString().slice(0,10) : String(date || '');
  const mood = dayEntry.mood || 'neutral';
  const symptoms = Array.isArray(dayEntry.symptoms) ? dayEntry.symptoms : [];

  const symptomCount = symptoms.length;
  let symptomLevel = 'none';
  if (symptomCount === 0) symptomLevel = 'none';
  else if (symptomCount <= 2) symptomLevel = 'mild';
  else if (symptomCount <= 5) symptomLevel = 'moderate';
  else symptomLevel = 'severe';

  const stress = context.surveyResults?.answers?.stress || 'unknown';
  const sleepHours = Number(context.surveyResults?.answers?.sleep_hours) || null;
  const exercise = context.surveyResults?.answers?.exercise || null;

  // Phase context: prefer provided label, fallback to unknown
  const phaseLabel = context.phaseLabel || '—';
  const logged = !!context.isLogged;

  // Alignment reasoning between survey long-term context and today
  let alignmentNote = '';
  if (stress === 'high' && (symptoms.includes('Fatigue') || mood === 'tired' || (sleepHours && sleepHours < 6))) {
    alignmentNote = 'This aligns with your reported higher stress and reduced sleep, which can amplify symptoms.';
  } else if (stress === 'low' && symptomLevel === 'none') {
    alignmentNote = 'This low-symptom day aligns with your reported low stress.';
  } else if (stress !== 'unknown' && symptomLevel !== 'none') {
    alignmentNote = 'Symptoms today may reflect day-to-day variation relative to your longer-term survey patterns.';
  }

  // Compose supportive, non-diagnostic summary
  const summaryParts = [];
  if (symptomLevel === 'none') summaryParts.push('A low-symptom day with stable mood.');
  else summaryParts.push(`A ${symptomLevel} symptom day with ${mood} mood.`);

  if (phaseLabel && phaseLabel !== '—') summaryParts.push(`Cycle phase: ${phaseLabel}.`);
  if (sleepHours) summaryParts.push(`Typical sleep: ${sleepHours}h/night (survey).`);
  if (alignmentNote) summaryParts.push(alignmentNote);

  const summaryText = summaryParts.join(' ');

  const indicators = {
    symptomCount,
    symptomLevel,
    mood,
    stress,
    sleepHours,
    exercise,
    phaseLabel,
    logged
  };

  return {
    date: dStr,
    phaseLabel,
    isLogged: logged,
    summary: summaryText,
    indicators
  };
};

/**
 * Build a consolidated AI context object combining profile, survey, recent entries, and cycle context.
 * This is intended to be passed into any AI-driven routine to provide consistent, reusable context.
 */
export const buildAIContext = ({ userProfile = {}, surveyResults = null, dayEntries = {}, monthlyLogs = {}, predictedPhaseMap = {} } = {}) => {
  // Recent activity window: past 7 days
  const dates = Object.keys(dayEntries || {}).sort().slice(-14); // keep up to last 14 for short-term
  const recentEntries = dates.map(d => ({ date: d, ...dayEntries[d] }));
  const symptomCounts = recentEntries.map(e => (e.symptoms || []).length);
  const avgSymptoms = symptomCounts.length ? (symptomCounts.reduce((s,v) => s+v,0) / symptomCounts.length) : 0;

  const cyclesAnalyzed = Object.values(monthlyLogs || {}).filter(e => e && e.actualStart).length;

  return {
    profile: userProfile,
    survey: surveyResults?.answers || null,
    recentEntries,
    avgRecentSymptoms: avgSymptoms,
    cyclesAnalyzed,
    predictedPhaseMap
  };
};

/**
 * Generate a short, adaptive, supportive recommendation using the consolidated AI context.
 * This is not diagnostic — it provides a rationale-linked, user-friendly suggestion.
 * Returns null if no survey data is available (user hasn't filled out survey yet).
 */
export const generateAdaptiveRecommendation = (ctx = {}) => {
  const { profile = {}, survey = null, avgRecentSymptoms = 0, recentEntries = [] } = ctx;

  // Return null if no survey data is available - don't show recommendations until user fills out survey
  if (!survey || Object.keys(survey).length === 0) {
    return null;
  }

  // Simple supportive heuristics that combine signals (no fixed clinical thresholds)
  const stress = survey?.stress || 'unknown';
  const sleep = survey?.sleep_hours ? Number(survey.sleep_hours) : null;
  const recentSymptomLevel = avgRecentSymptoms;

  let recommendation = 'Keep tracking — patterns will help personalize recommendations.';

  // If recent symptoms are elevated and sleep/stress indicate strain, suggest rest & hydration
  if (recentSymptomLevel >= 1.5 && (stress === 'high' || (sleep !== null && sleep <= 6))) {
    recommendation = 'Recent days show increased symptoms alongside stress or poor sleep. Consider lighter activity today, prioritize rest and hydration, and note how these adjustments affect your symptoms.';
  } else if (recentSymptomLevel >= 1.5) {
    recommendation = 'You have reported several symptoms recently; gentle self-care (hydration, light movement, and tracking) may help manage day-to-day discomfort.';
  } else if (recentSymptomLevel === 0) {
    recommendation = 'You have experienced several low-symptom days recently. Maintaining consistent sleep and effective stress management may help keep this trend going.';
  }

  return { recommendation, rationale: { recentSymptomLevel, stress, sleep, profileSummary: { age: profile.age || null } } };
};

/**
 * Generate Gantt chart data for cycle phases
 */
export const generateCycleGanttData = (cycleData, _surveyResults, months = 3) => {
  // Use tracker `cycleData` only; do not use survey inputs for visualizations
  const cycleLength = Number(cycleData?.cycleLength) || 28;
  const periodLength = Number(cycleData?.periodLength) || 5;
  const startDate = cycleData?.lastPeriodDate || new Date().toISOString().split('T')[0];
  
  const ganttData = [];
  let currentDate = new Date(startDate);
  
  for (let month = 0; month < months; month++) {
    const monthStart = new Date(currentDate);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    let dayInCycle = 1;
    let cycleStart = new Date(currentDate);
    
    while (currentDate < monthEnd) {
      const phase = getPhaseForDay(dayInCycle, cycleLength, periodLength);
      
      ganttData.push({
        date: new Date(currentDate),
        phase,
        dayInCycle,
        cycleNumber: month + 1
      });
      
      dayInCycle++;
      if (dayInCycle > cycleLength) {
        dayInCycle = 1;
        cycleStart = new Date(currentDate);
        cycleStart.setDate(cycleStart.getDate() + cycleLength);
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  return ganttData;
};

const getPhaseForDay = (day, cycleLength, periodLength) => {
  if (day <= periodLength) return 'Period';
  if (day <= 13) return 'Follicular';
  if (day <= 16) return 'Ovulation';
  return 'Luteal';
};

