import React from 'react';
import { 
  Flame, 
  Zap, 
  BatteryWarning, 
  Users, 
  Wrench, 
  Route, 
  Clock, 
  CheckCheck, 
  AlertTriangle 
} from 'lucide-react';
import './DriverConsole.css';

// Mapeamento de anomalia para ícone do Lucide
const ICON_MAP = {
  SOBREAQUECIMENTO: Flame,
  FALHA_CARREGADOR: Zap,
  BATERIA_CRITICA: BatteryWarning,
  PROBLEMA_PASSAGEIRO: Users,
  AVARIA_MECANICA: Wrench,
  DESVIO_ROTA: Route,
};

export default function AlertPanel({ 
  anomalias, 
  alertStates, // Dicionário { TIPO_ANOMALIA: "DISPONIVEL" | "LOADING" | "PENDENTE" | "EM_CURSO" | "ESCALADO" }
  onAlertClick, 
  online 
}) {
  return (
    <section className="driver-panel-left">
      <h2 className="driver-panel-title">Alertas Operacionais (UC6)</h2>
      <div className="driver-alert-grid">
        {anomalias.map((anomalia) => {
          const IconComponent = ICON_MAP[anomalia.tipo] || AlertTriangle;
          const status = alertStates[anomalia.tipo] || 'DISPONIVEL';
          
          // Classes de estilo baseadas no estado e prioridade
          let stateClass = '';
          if (status === 'LOADING') stateClass = 'loading';
          else if (status === 'PENDENTE') stateClass = 'pending';
          else if (status === 'EM_CURSO') stateClass = 'in_progress';
          else if (status === 'ESCALADO') stateClass = 'escalated';
          else stateClass = anomalia.critica ? 'critical' : 'normal';

          // Determinar se o botão está desativado
          const isDisabled = !online || status === 'PENDENTE' || status === 'EM_CURSO' || status === 'ESCALADO' || status === 'LOADING';

          // Conteúdo reativo do botão
          const renderButtonContent = () => {
            if (status === 'LOADING') {
              return (
                <>
                  <div className="driver-btn-spinner" />
                  <span className="btn-label">A enviar...</span>
                </>
              );
            }
            if (status === 'PENDENTE') {
              return (
                <>
                  <Clock size={40} className="animate-pulse" />
                  <span className="btn-label">{anomalia.label}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>A aguardar...</span>
                </>
              );
            }
            if (status === 'EM_CURSO') {
              return (
                <>
                  <CheckCheck size={40} />
                  <span className="btn-label">{anomalia.label}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>Em Curso</span>
                </>
              );
            }
            if (status === 'ESCALADO') {
              return (
                <>
                  <AlertTriangle size={40} />
                  <span className="btn-label">{anomalia.label}</span>
                  <span style={{ fontSize: '11px', opacity: 0.9, fontWeight: 'bold' }}>ESCALADO</span>
                </>
              );
            }
            return (
              <>
                <IconComponent size={40} className="btn-icon" />
                <span className="btn-label">{anomalia.label}</span>
              </>
            );
          };

          return (
            <button
              key={anomalia.tipo}
              className={`driver-alert-btn ${stateClass}`}
              onClick={() => onAlertClick(anomalia)}
              disabled={isDisabled}
              id={`btn-alerta-${anomalia.tipo.toLowerCase()}`}
              title={`${anomalia.label} (${anomalia.critica ? 'Crítica' : 'Normal'})`}
            >
              {renderButtonContent()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
