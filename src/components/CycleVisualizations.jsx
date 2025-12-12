import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateCyclePhaseDistribution, generateCycleGanttData } from '../utils/mlPrediction';

const COLORS = {
  Menstruation: '#f56565',
  Follicular: '#f8a855',
  Ovulation: '#ffd700',
  Luteal: '#b19cd9'
};

const CycleVisualizations = ({ cycleData, surveyResults, selectedDate }) => {
  const phaseDistribution = calculateCyclePhaseDistribution(cycleData, surveyResults, selectedDate);
  const ganttData = generateCycleGanttData(cycleData, surveyResults, 3);
  
  // Prepare pie chart data
  const pieData = phaseDistribution.map(phase => ({
    name: phase.name,
    value: phase.days,
    color: phase.color
  }));
  
  // Prepare Gantt chart data (grouped by phase)
  const ganttChartData = [];
  const phaseGroups = {};
  
  ganttData.forEach(item => {
    const monthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;
    if (!phaseGroups[monthKey]) {
      phaseGroups[monthKey] = {
        month: item.date.toLocaleString('default', { month: 'short', year: 'numeric' }),
        Menstruation: 0,
        Follicular: 0,
        Ovulation: 0,
        Luteal: 0
      };
    }
    phaseGroups[monthKey][item.phase]++;
  });
  
  Object.values(phaseGroups).forEach(group => {
    ganttChartData.push(group);
  });
  
  return (
    <div className="visualizations-container">
      <div className="chart-row">
        <div className="chart-card">
          <h3>Cycle Phase Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="chart-card">
          <h3>Cycle Phase Timeline (Gantt View)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ganttChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="month" type="category" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Menstruation" stackId="a" fill={COLORS.Menstruation} />
              <Bar dataKey="Follicular" stackId="a" fill={COLORS.Follicular} />
              <Bar dataKey="Ovulation" stackId="a" fill={COLORS.Ovulation} />
              <Bar dataKey="Luteal" stackId="a" fill={COLORS.Luteal} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="phase-details">
        <h3>Phase Breakdown</h3>
        <div className="phase-grid">
          {phaseDistribution.map((phase, idx) => (
            <div key={idx} className="phase-item" style={{ borderLeftColor: phase.color }}>
              <div className="phase-name">{phase.name}</div>
              <div className="phase-days">{phase.days} days</div>
              <div className="phase-percentage">
                {((phase.days / phaseDistribution.reduce((sum, p) => sum + p.days, 0)) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CycleVisualizations;

