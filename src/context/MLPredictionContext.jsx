import { createContext, useContext, useState } from 'react';

const MLPredictionContext = createContext(null);

export const MLPredictionProvider = ({ children }) => {
  const [mlPrediction, setMlPrediction] = useState(null);
  const [userFeatures, setUserFeatures] = useState(null);

  return (
    <MLPredictionContext.Provider value={{ mlPrediction, setMlPrediction, userFeatures, setUserFeatures }}>
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



