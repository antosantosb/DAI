/**
 * Sprint 1 (F1): banner pequeno a indicar que isto e' um projeto academico,
 * nao a plataforma oficial dos TUB. Critico quando deployed publicamente no
 * Azure para nao induzir o visitante em erro.
 *
 * Props:
 *   - variant: 'inline' (default — uma linha discreta) | 'block' (com fundo)
 *   - className: classe adicional
 */
import { useTranslation } from 'react-i18next';
import './ProjectDisclaimer.css';

export default function ProjectDisclaimer({ variant = 'inline', className = '', ...rest }) {
  const { t } = useTranslation();

  return (
    <div
      className={`project-disclaimer project-disclaimer--${variant} ${className}`.trim()}
      role="note"
      {...rest}
    >
      <svg
        className="project-disclaimer-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="project-disclaimer-text">{t('pages.projectDisclaimer.text')}</span>
    </div>
  );
}
