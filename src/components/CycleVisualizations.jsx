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
  
  // Prepare pie chart data (include percent for labels)
  const totalDays = phaseDistribution.reduce((s, p) => s + (p.days || 0), 0) || 1;
  const pieData = phaseDistribution.map(phase => ({
    name: phase.name,
    value: phase.days,
    color: phase.color || COLORS[phase.name] || '#ccc',
    percent: ((phase.days || 0) / totalDays) * 100
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
                label={({ index }) => `${pieData[index].name}: ${Math.round(pieData[index].percent)}%`}
                outerRadius={90}
                innerRadius={40}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value} days`} />
              <Legend verticalAlign="bottom" iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="chart-card">
          <h3>Cycle Phase Timeline (Gantt View)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ganttChartData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 32]} ticks={[0, 8, 16, 24, 32]} />
              <YAxis dataKey="month" type="category" width={110} />
              <Tooltip formatter={(value, name) => [`${value} days`, name]} />
              <Legend verticalAlign="bottom" iconType="square" />
              <Bar dataKey="Menstruation" stackId="a" fill={COLORS.Menstruation} barSize={18} />
              <Bar dataKey="Follicular" stackId="a" fill={COLORS.Follicular} barSize={18} />
              <Bar dataKey="Ovulation" stackId="a" fill={COLORS.Ovulation} barSize={18} />
              <Bar dataKey="Luteal" stackId="a" fill={COLORS.Luteal} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <div className="phase-details">
        <h3>Phase Breakdown</h3>
        <div className="phase-grid">
          {phaseDistribution.map((phase, idx) => (
            <div key={idx} className="phase-item" style={{ borderLeftColor: phase.color, ['--phase-color']: phase.color }}>
              <div className="phase-name">{phase.name}</div>
              <div className="phase-days">{phase.days} days</div>
              <div className="phase-percentage">
                {((phase.days / totalDays) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CycleVisualizations;

