// Avatar reutilizavel: mostra a foto de perfil do user (presigned URL) ou um
// "letter avatar" com gradient consistente baseado em hash(name).
//
// Props:
//   url   string  presigned URL (opcional). Se ausente/null, cai no letter avatar.
//   name  string  nome usado para a inicial + cor do background do fallback.
//   size  string|number   "sm" | "md" | "lg" | "xl"  ou um numero (px).
//   alt   string  texto alternativo (default: name).
//   className string extra classes do consumidor.

import { useState } from 'react';
import './Avatar.css';

// Palette curada de gradients usados no fallback. Escolhido por hash do nome,
// para que o mesmo user tenha sempre a mesma cor em todas as views.
const GRADIENTS = [
  ['#6366f1', '#8b5cf6'], // indigo -> violet
  ['#0ea5e9', '#6366f1'], // sky -> indigo
  ['#10b981', '#059669'], // emerald
  ['#f59e0b', '#ef4444'], // amber -> red
  ['#ec4899', '#f43f5e'], // pink -> rose
  ['#8b5cf6', '#ec4899'], // violet -> pink
  ['#14b8a6', '#0ea5e9'], // teal -> sky
  ['#f97316', '#f59e0b'], // orange -> amber
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function gradientFor(name) {
  const idx = hashString(name || '?') % GRADIENTS.length;
  return GRADIENTS[idx];
}

function sizeToPx(size) {
  if (typeof size === 'number') return size;
  switch (size) {
    case 'sm': return 24;
    case 'lg': return 56;
    case 'xl': return 96;
    case 'md':
    default:   return 36;
  }
}

export default function Avatar({ url, name, size = 'md', alt, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const px = sizeToPx(size);
  const safeName = (name || '').trim();
  const initial = (safeName.charAt(0) || '?').toUpperCase();
  const [c1, c2] = gradientFor(safeName);

  const sizeClass =
    typeof size === 'string' ? `pgu-avatar--${size}` : '';
  const cls = `pgu-avatar ${sizeClass} ${className}`.trim();

  const style = {
    width: px,
    height: px,
    // font scale proporcional ao tamanho
    fontSize: Math.max(11, Math.round(px * 0.42)),
  };

  if (url && !imgFailed) {
    return (
      <span className={`${cls} pgu-avatar--img`} style={style} title={safeName || undefined}>
        <img
          src={url}
          alt={alt || safeName || 'avatar'}
          onError={() => setImgFailed(true)}
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`${cls} pgu-avatar--letter`}
      style={{
        ...style,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
      title={safeName || undefined}
      aria-label={alt || safeName || 'avatar'}
    >
      {initial}
    </span>
  );
}
