import { Check, FileText, Milk, Trash2 } from 'lucide-react';
import { categories } from '../core/types';
import type { Category, SortState } from '../core/types';
export const labels: Record<Category, string> = {
  trash: 'Trash',
  paper: 'Paper',
  plastic: 'Plastic',
};
export const BinIcon = ({ category, size = 24 }: { category: Category; size?: number }) =>
  category === 'paper' ? (
    <FileText size={size} />
  ) : category === 'plastic' ? (
    <Milk size={size} />
  ) : (
    <Trash2 size={size} />
  );
export default function Bins({ state }: { state: SortState }) {
  const active = state.target || state.position;
  return (
    <section className="panel bins-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE RIGHT PLACE</span>
          <h2>Three bins. One small difference.</h2>
        </div>
        <span className="tag">
          {state.settings.deviceMode === 'arduino' ? 'ARDUINO · TIMED' : 'SIMULATED'}
        </span>
      </div>
      <div className={'bins-stage ' + (state.stage === 'moving' ? 'is-moving' : '')}>
        <div className="rail" />
        {categories.map((category) => (
          <div
            key={category}
            className={`bin-unit ${category} ${active === category ? 'selected' : ''}`}
          >
            <div className="bin-indicator">
              {active === category && state.stage === 'deposit' ? (
                <>
                  <Check size={13} /> READY
                </>
              ) : active === category && state.stage === 'moving' ? (
                'ALIGNING…'
              ) : (
                `${state.settings.angles[category]}°`
              )}
            </div>
            <div className="bin-lid" />
            <div className="bin-body">
              <BinIcon category={category} size={30} />
              <span>{labels[category]}</span>
              <div className="bin-ribs">
                <i />
                <i />
                <i />
              </div>
            </div>
            <p>
              {category === 'trash'
                ? 'The non-recyclables'
                : category === 'paper'
                  ? 'Clean & dry'
                  : 'Empty & rigid'}
            </p>
          </div>
        ))}
      </div>
      <div className="mechanism-note">
        <span className={'status-dot ' + (state.stage === 'moving' ? 'pulsing' : '')} />
        {state.stage === 'moving'
          ? 'Rotating to the selected bin'
          : state.stage === 'deposit' && active
            ? `${labels[active]} bin is in position`
            : state.settings.deviceMode === 'arduino'
              ? state.connected
                ? 'Arduino connected · completion is timed, not sensor-verified'
                : 'Arduino disconnected · reconnect in Setup'
              : 'Simulated mechanism · select Arduino in Setup for USB movement'}
      </div>
    </section>
  );
}
