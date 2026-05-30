import React, { useState } from 'react';
import { Sliders, MessageSquarePlus, Wifi, WifiOff, Play, AlertOctagon, ChevronDown, ChevronUp } from 'lucide-react';
import './DriverConsole.css';

export default function SimulatorPanel({ 
  online, 
  onToggleOnline, 
  onSimulateMessage, 
  onSimulateEmCurso, 
  forceEscalation, 
  onToggleForceEscalation 
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Botão flutuante para abrir/fechar o painel */}
      <button 
        className="driver-sim-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Painel de Simulação (Dev/Demo)"
        id="driver-sim-toggle-btn"
      >
        {isOpen ? <ChevronDown size={24} /> : <Sliders size={24} />}
      </button>

      {/* Painel do Simulador deslizante */}
      <div className={`driver-simulator-bar ${isOpen ? 'open' : ''}`} id="driver-simulator-panel">
        <div className="driver-sim-header">
          <span className="driver-sim-title">Painel de Simulação e Auditoria (STANDALONE MOCK)</span>
          <button 
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setIsOpen(false)}
          >
            <ChevronDown size={18} /> Ocultar
          </button>
        </div>

        <div className="driver-sim-controls">
          {/* Controlo de Ligação */}
          <button 
            className={`driver-sim-btn ${online ? 'danger' : ''}`}
            onClick={onToggleOnline}
            id="sim-btn-toggle-online"
          >
            {online ? (
              <>
                <WifiOff size={18} />
                <span>Simular Perda de Rede (OFFLINE)</span>
              </>
            ) : (
              <>
                <Wifi size={18} />
                <span>Restabelecer Rede (ONLINE)</span>
              </>
            )}
          </button>

          {/* Simular nova mensagem de despacho */}
          <button 
            className="driver-sim-btn"
            onClick={onSimulateMessage}
            disabled={!online}
            id="sim-btn-new-msg"
          >
            <MessageSquarePlus size={18} />
            <span>Simular Nova Mensagem CCO</span>
          </button>

          {/* Simular Operador assumir ocorrência (EM_CURSO) */}
          <button 
            className="driver-sim-btn"
            onClick={onSimulateEmCurso}
            disabled={!online}
            id="sim-btn-em-curso"
          >
            <Play size={18} />
            <span>Simular Assumir Alerta (EM_CURSO)</span>
          </button>

          {/* Toggle de Auto-Escalamento */}
          <label className="driver-sim-toggle-field" id="sim-field-escalation">
            <input 
              type="checkbox" 
              checked={forceEscalation}
              onChange={(e) => onToggleForceEscalation(e.target.checked)}
            />
            <AlertOctagon size={18} style={{ color: forceEscalation ? '#f59e0b' : '#9ca3af' }} />
            <span>Forçar Escalamento Automático (10s)</span>
          </label>
        </div>
      </div>
    </>
  );
}
