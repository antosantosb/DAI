export default function StatIcon({ type }) {
  const icons = {
    bus: (
      <svg viewBox="0 0 80 44" fill="none">
        {/* Same bus shape as BusIcon for consistency */}
        <path d="M10 12 C10 9 12 7 15 7 L60 7 C64 7 67 8 68 11 L70 16 L70 33 C70 34.5 69 35.5 67.5 35.5 L12.5 35.5 C11 35.5 10 34.5 10 33 Z" fill="currentColor" opacity="0.12" />
        <path d="M10 12 C10 9 12 7 15 7 L60 7 C64 7 67 8 68 11 L70 16 L70 33 C70 34.5 69 35.5 67.5 35.5 L12.5 35.5 C11 35.5 10 34.5 10 33 Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        {/* Roof */}
        <rect x="12" y="7" width="53" height="2.5" rx="1.2" fill="currentColor" opacity="0.1" />
        {/* Windows */}
        <rect x="15" y="13" width="9" height="9" rx="2" fill="currentColor" opacity="0.18" />
        <rect x="27" y="13" width="9" height="9" rx="2" fill="currentColor" opacity="0.18" />
        <rect x="39" y="13" width="9" height="9" rx="2" fill="currentColor" opacity="0.18" />
        {/* Windshield */}
        <path d="M52 13 L56 13 C58 13 60 14 60.5 15.5 L62 22 L52 22 Z" fill="currentColor" opacity="0.15" />
        {/* Stripe */}
        <rect x="10" y="24" width="60" height="1.5" rx="0.5" fill="currentColor" opacity="0.1" />
        {/* Door */}
        <rect x="19" y="25" width="6" height="10.5" rx="1" fill="currentColor" opacity="0.12" />
        {/* Headlight */}
        <rect x="68.5" y="18" width="2.5" height="4" rx="1" fill="currentColor" opacity="0.3" />
        {/* Tail light */}
        <rect x="10" y="26" width="2" height="4" rx="1" fill="currentColor" opacity="0.25" />
        {/* Wheels */}
        <circle cx="22" cy="34" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <circle cx="22" cy="34" r="3" fill="currentColor" opacity="0.12" />
        <circle cx="22" cy="34" r="1.2" fill="currentColor" opacity="0.5" />
        <circle cx="58" cy="34" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <circle cx="58" cy="34" r="3" fill="currentColor" opacity="0.12" />
        <circle cx="58" cy="34" r="1.2" fill="currentColor" opacity="0.5" />
        {/* Wheel arches */}
        <path d="M15 35.5 Q22 27 29 35.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.15" />
        <path d="M51 35.5 Q58 27 65 35.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.15" />
      </svg>
    ),
    stop: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 2C10.48 2 6 6.48 6 12C6 19.5 16 30 16 30C16 30 26 19.5 26 12C26 6.48 21.52 2 16 2Z" fill="currentColor" opacity="0.12" />
        <path d="M16 2C10.48 2 6 6.48 6 12C6 19.5 16 30 16 30C16 30 26 19.5 26 12C26 6.48 21.52 2 16 2Z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <circle cx="16" cy="12" r="4.5" fill="currentColor" opacity="0.2" />
        <circle cx="16" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="13.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" opacity="0.3" />
        <text x="16" y="13.5" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="800">P</text>
      </svg>
    ),
    route: (
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M8 26C8 26 8 18 14 18C20 18 20 10 20 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" opacity="0.3" />
        <path d="M14 26C14 26 14 22 20 22C26 22 26 14 26 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2" opacity="0.3" />
        <circle cx="8" cy="26" r="3.5" fill="currentColor" opacity="0.15" />
        <circle cx="8" cy="26" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="8" cy="26" r="1.5" fill="currentColor" />
        <circle cx="20" cy="10" r="3" fill="currentColor" opacity="0.15" />
        <circle cx="20" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="20" cy="10" r="1.2" fill="currentColor" />
        <circle cx="26" cy="14" r="3" fill="currentColor" opacity="0.15" />
        <circle cx="26" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="26" cy="14" r="1.2" fill="currentColor" />
        <path d="M5 6L8 3L11 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="3" x2="8" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    active: (
      <svg viewBox="0 0 32 32" fill="none">
        {/* Gauge/speedometer arc */}
        <path d="M6 22C6 14.27 12.27 8 20 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.15" />
        <path d="M6 22C6 16.48 9.58 11.77 14.5 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.35" />
        {/* Needle */}
        <line x1="16" y1="22" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="22" r="2.5" fill="currentColor" />
        {/* Tick marks */}
        <line x1="7" y1="20" x2="9" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        <line x1="8.5" y1="14.5" x2="10" y2="15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        <line x1="13" y1="10.5" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        <line x1="19" y1="9" x2="19" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        <line x1="24" y1="11" x2="23" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
        {/* Base line */}
        <line x1="8" y1="26" x2="24" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
      </svg>
    ),
  };

  return icons[type] || null;
}
