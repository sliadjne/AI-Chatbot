import { useState } from 'react';
import './MonthlyLogs.css';

const formatLocal = (ymd) => {
  if (!ymd) return 'Not logged yet';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString();
};

const MonthCard = ({ keyStr, entry, onLogActual, onUpdateActual, onOpenLog }) => {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(entry.actualStart || '');
  const [end, setEnd] = useState(entry.actualEnd || '');

  const submit = () => {
    if (!start) return;
    // Do not allow editing or re-logging the immutable initial cycle
    if (entry.isInitialCycle) return;
    if (entry.actualStart) {
      onUpdateActual && onUpdateActual(keyStr, start, end || null);
    } else {
      onLogActual && onLogActual(keyStr, start, end || null);
    }
    setEditing(false);
  };

  return (
    <div className="month-card">
      <div className="month-header">
        <strong>{keyStr}</strong>
      </div>
      <div className="month-body">
          <div className="row"><span className="label">Predicted</span><span className="value">{entry.isInitialCycle ? '—' : (entry.predictedStart ? `${formatLocal(entry.predictedStart)} → ${formatLocal(entry.predictedEnd)}` : '—')}</span></div>
          <div className="row"><span className="label">Actual</span><span className="value">{(() => {
            if (!entry.actualStart) return 'Not logged yet';
            const s = formatLocal(entry.actualStart);
            if (!entry.actualEnd) return `${s}${entry.isInitialCycle ? ' — as logged (locked)' : ''}`;
            const e = formatLocal(entry.actualEnd);
            const [sy, sm, sd] = entry.actualStart.split('-').map(Number);
            const [ey, em, ed] = entry.actualEnd.split('-').map(Number);
            const startDate = new Date(sy, sm - 1, sd);
            const endDate = new Date(ey, em - 1, ed);
            const days = Math.round((endDate - startDate) / (1000*60*60*24)) + 1;
            return `${s} → ${e} (${days} days)${entry.isInitialCycle ? ' — as logged (locked)' : ''}`;
           })()}</span></div>
      </div>
      <div className="month-actions">
        {!entry.actualStart && !editing && !entry.isInitialCycle && <button className="btn" onClick={() => setEditing(true)}>Log actual period</button>}
        {entry.actualStart && !editing && !entry.isInitialCycle && <button className="btn small" onClick={() => setEditing(true)}>Edit actual</button>}
        {editing && (
          <div className="edit-form">
            <label>Actual Start</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <label>Actual End</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            <div className="actions-row">
              <button className="btn" onClick={submit}>Save</button>
              <button className="btn secondary" onClick={() => { setEditing(false); setStart(entry.actualStart || ''); setEnd(entry.actualEnd || ''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MonthlyLogs = ({ monthlyLogs = {}, onLogActual, onUpdateActual, onOpenLog }) => {
  const keys = Object.keys(monthlyLogs).sort((a,b) => (a < b ? 1 : -1)); // newest first
  if (!keys.length) return (<div className="monthly-logs-empty">No monthly logs yet.</div>);

  return (
    <div className="monthly-logs">
      {keys.map((k) => (
        <MonthCard key={k} keyStr={k} entry={monthlyLogs[k]} onLogActual={(key, s, e) => onLogActual(key, s, e)} onUpdateActual={(key, s, e) => onUpdateActual(key, s, e)} onOpenLog={(key) => onOpenLog && onOpenLog(key)} />
      ))}
    </div>
  );
};

export default MonthlyLogs;
