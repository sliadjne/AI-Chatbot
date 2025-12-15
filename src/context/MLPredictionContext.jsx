import { createContext, useContext, useState } from 'react';

const MLPredictionContext = createContext(null);

export const MLPredictionProvider = ({ children }) => {
  const [mlPrediction, setMlPrediction] = useState(null);
  const [userFeatures, setUserFeatures] = useState(null);
  const [latestDailySummary, setLatestDailySummary] = useState(null);
  const [latestRecommendation, setLatestRecommendation] = useState(null);

  return (
    <MLPredictionContext.Provider value={{ mlPrediction, setMlPrediction, userFeatures, setUserFeatures, latestDailySummary, setLatestDailySummary, latestRecommendation, setLatestRecommendation }}>
      {children}
    </MLPredictionContext.Provider>
  );
};

export const useMLPrediction = () => {
  const context = useContext(MLPredictionContext);
  if (!context) {
    throw new Error('useMLPrediction must be used within MLPredictionProvider');
  }
  return context;
};



