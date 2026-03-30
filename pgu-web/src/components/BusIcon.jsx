import './BusIcon.css';

export default function BusIcon({ status = 'stopped' }) {
  const isMoving = status === 'active' || status === 'stopping';
  const isStopped = status === 'stopped';
  const isAtStop = status === 'at-stop';

  return (
    <div className={`bus-icon-wrap bus-icon-wrap--${status}`}>
      {/* Road */}
      <div className={`bus-icon-road ${isMoving ? 'bus-icon-road--moving' : ''}`}></div>

      {/* Exhaust */}
      {isMoving && (
        <div className="bus-icon-exhaust">
          <span className="exhaust-puff exhaust-puff--1"></span>
          <span className="exhaust-puff exhaust-puff--2"></span>
        </div>
      )}

      <svg
        className={`bus-icon-svg ${isMoving ? 'bus-icon-svg--driving' : ''} ${isStopped ? 'bus-icon-svg--stopped' : ''}`}
        viewBox="0 0 80 44"
        fill="none"
      >
        {/* Shadow under bus */}
        <ellipse cx="40" cy="40" rx="28" ry="2" fill="rgba(0,0,0,0.08)" />

        {/* Main body */}
        <path d="M10 12 C10 9 12 7 15 7 L60 7 C64 7 67 8 68 11 L70 16 L70 33 C70 34.5 69 35.5 67.5 35.5 L12.5 35.5 C11 35.5 10 34.5 10 33 Z" className="bus-body" />

        {/* Roof line accent */}
        <rect x="12" y="7" width="53" height="2.5" rx="1.2" className="bus-roof" />

        {/* Windows - evenly spaced, clean */}
        <rect x="15" y="13" width="9" height="9" rx="2" className="bus-window" />
        <rect x="27" y="13" width="9" height="9" rx="2" className="bus-window" />
        <rect x="39" y="13" width="9" height="9" rx="2" className="bus-window" />

        {/* Front windshield - larger, angled look */}
        <path d="M52 13 L56 13 C58 13 60 14 60.5 15.5 L62 22 L52 22 Z" className="bus-windshield" />

        {/* Door */}
        <rect x="19" y="25" width="6" height="10.5" rx="1" className={`bus-door ${isAtStop ? 'bus-door--open' : ''}`} />
        {isAtStop && <line x1="22" y1="25" x2="22" y2="35.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />}

        {/* Front bumper */}
        <rect x="67" y="28" width="4" height="6" rx="1.5" className="bus-bumper" />

        {/* Headlight */}
        <rect x="68.5" y="18" width="2.5" height="4" rx="1" className={`bus-headlight ${isMoving ? 'bus-headlight--on' : ''}`} />

        {/* Tail light */}
        <rect x="10" y="26" width="2" height="4" rx="1" className={`bus-taillight ${status === 'stopping' ? 'bus-taillight--brake' : ''}`} />

        {/* Route number display */}
        <rect x="56" y="9.5" width="8" height="5" rx="1" className="bus-display" />
        <rect x="57.5" y="10.5" width="5" height="3" rx="0.5" fill="rgba(250,220,80,0.9)" />

        {/* Side stripe */}
        <rect x="10" y="24" width="60" height="1.5" rx="0.5" fill="rgba(255,255,255,0.25)" />

        {/* Wheels */}
        <g className={`bus-wheel ${isMoving ? 'bus-wheel--spinning' : ''}`} style={{ transformOrigin: '22px 34px' }}>
          <circle cx="22" cy="34" r="5" className="wheel-outer" />
          <circle cx="22" cy="34" r="3" className="wheel-mid" />
          <circle cx="22" cy="34" r="1.2" className="wheel-inner" />
        </g>
        <g className={`bus-wheel ${isMoving ? 'bus-wheel--spinning' : ''}`} style={{ transformOrigin: '58px 34px' }}>
          <circle cx="58" cy="34" r="5" className="wheel-outer" />
          <circle cx="58" cy="34" r="3" className="wheel-mid" />
          <circle cx="58" cy="34" r="1.2" className="wheel-inner" />
        </g>

        {/* Wheel arches */}
        <path d="M15 35.5 Q22 27 29 35.5" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" />
        <path d="M51 35.5 Q58 27 65 35.5" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" />
      </svg>

      {isAtStop && <div className="bus-icon-stop-sign">P</div>}
    </div>
  );
}
