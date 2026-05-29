/**
 * Sprint 1 (F1): logo oficial TUB - Transportes Urbanos de Braga.
 *
 * Assets:
 *   - /tub-logo-color.svg  → variante a cores (t vermelho + ub azul)
 *   - /tub-logo.svg        → variante branca (originada de tub.pt _w.svg)
 *
 * Aspect ratio do wordmark oficial: 544 : 211.3 ≈ 2.575 : 1
 *
 * Props:
 *   - size:    altura em px (default 32). Largura derivada do aspect ratio.
 *   - variant: 'color' (default — para fundos claros e escuros) | 'white'
 *              (para fundos saturados/coloridos)
 *   - className: classe adicional
 */
const ASPECT = 544 / 211.3;

export default function TubLogo({ size = 32, variant = 'color', className, ...rest }) {
  const src = variant === 'white' ? '/tub-logo.svg' : '/tub-logo-color.svg';
  const width = Math.round(size * ASPECT);

  return (
    <img
      src={src}
      width={width}
      height={size}
      alt="TUB - Transportes Urbanos de Braga"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
      {...rest}
    />
  );
}
