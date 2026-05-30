import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Client } from '@stomp/stompjs';
import api from '../services/api';
import StatusBar from '../components/driver/StatusBar';
import AlertPanel from '../components/driver/AlertPanel';
import MessageFeed from '../components/driver/MessageFeed';
import SimulatorPanel from '../components/driver/SimulatorPanel';
import Modal from '../components/Modal';
import { ANOMALIAS, HISTORICO_MENSAGENS, MOCK_DRIVERS, MOCK_ASSIGNMENTS, MOCK_BUSES } from '../components/driver/mockData';
import '../components/driver/DriverConsole.css';

// Flag de simulação offline - DEFINIR COMO false ANTES DE DAR COMMIT
const ENABLE_MOCK_LOGIN_BYPASS = true;

export default function DriverConsole() {
  // Sessão do Motorista e Viatura
  const [currentDriver, setCurrentDriver] = useState(() => {
    const saved = localStorage.getItem('pgu_driver');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeBus, setActiveBus] = useState(() => {
    const saved = localStorage.getItem('pgu_active_bus');
    return saved ? JSON.parse(saved) : null;
  });

  // Estados do ecrã de Setup (Login)
  const [mechanographicInput, setMechanographicInput] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Estados Gerais da Consola
  const [online, setOnline] = useState(true);
  const [time, setTime] = useState('');
  const [lastSync, setLastSync] = useState(Date.now());
  const [alertStates, setAlertStates] = useState(
    ANOMALIAS.reduce((acc, alert) => ({ ...acc, [alert.tipo]: 'DISPONIVEL' }), {})
  );
  const [ocorrenciaIds, setOcorrenciaIds] = useState({}); // { [TIPO]: numeric_id }
  const [messages, setMessages] = useState(HISTORICO_MENSAGENS);
  const [confirmingMsgIds, setConfirmingMsgIds] = useState({});
  const [forceEscalation, setForceEscalation] = useState(true);

  // Refs para gerir conexões e timers
  const stompClientRef = useRef(null);
  const isWsConnectedRef = useRef(false);
  const escalationTimersRef = useRef({}); // { [TIPO]: timerId }
  const toastIdsRef = useRef({}); // { [KEY]: toastId }

  // 3. Atualização do Relógio em Tempo Real
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 4. Verificador de Conectividade Baseado em Sync
  useEffect(() => {
    const interval = setInterval(() => {
      // Considera offline se o lastSync tiver mais de 30 segundos
      const diff = Date.now() - lastSync;
      const isCurrentlyOnline = diff < 30000;
      
      if (isCurrentlyOnline !== online) {
        setOnline(isCurrentlyOnline);
        if (!isCurrentlyOnline) {
          // Dispara toast persistente de rede
          const toastId = toast.error("Ligação ao Centro de Controlo perdida", {
            position: "top-center",
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            toastId: "network-offline"
          });
          toastIdsRef.current["network"] = toastId;
        } else {
          // Limpa toast de rede
          if (toastIdsRef.current["network"]) {
            toast.dismiss("network-offline");
            delete toastIdsRef.current["network"];
          }
          toast.success("Ligação restabelecida com o Centro de Controlo", {
            position: "top-center",
            autoClose: 3000,
          });
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [lastSync, online]);

  // 5. Configuração da Ligação WebSocket (STOMP Nativo)
  useEffect(() => {
    if (!activeBus?.busCode) {
      isWsConnectedRef.current = false;
      return;
    }

    const busCode = activeBus.busCode;
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProto}://${window.location.host}/ws-telemetry`;

    console.log(`CM tentando ligar ao WebSocket: ${wsUrl} para o autocarro ${busCode}`);
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log(`CM ligada com sucesso ao WebSocket STOMP nativo para o autocarro ${busCode}.`);
        isWsConnectedRef.current = true;
        setLastSync(Date.now());

        // Carregar mensagens reais do despacho do backend ao iniciar
        const loadInitialMessages = async () => {
          try {
            const response = await api.get(`/despacho/${busCode}/mensagens`);
            if (response.data) {
              const sorted = (response.data || [])
                .slice(0, 50)
                .sort((a, b) => new Date(a.timestampEnvio) - new Date(b.timestampEnvio));
              setMessages(sorted);
            }
          } catch (err) {
            console.warn("Erro ao obter mensagens iniciais do backend:", err);
          }
        };
        loadInitialMessages();

        // Subscrição em tempo real a transições de ocorrências (UC6)
        client.subscribe('/topic/alertas', (message) => {
          if (!message.body) return;
          try {
            const doc = JSON.parse(message.body);
            if (doc.ativoId === busCode) {
              handleIncomingOcorrenciaUpdate(doc);
            }
          } catch (e) {
            console.error("Erro ao analisar broadcast em /topic/alertas", e);
          }
        });

        // Subscrição às mensagens de despacho destinadas a esta consola (UC7)
        client.subscribe(`/topic/mensagens/${busCode}`, (message) => {
          if (!message.body) return;
          try {
            const dispatchMsg = JSON.parse(message.body);
            handleIncomingDispatchMessage(dispatchMsg);
          } catch (e) {
            console.error("Erro ao analisar mensagem em /topic/mensagens", e);
          }
        });
      },
      onDisconnect: () => {
        console.warn('WebSocket STOMP desconectado. Entrando em modo local/simulado.');
        isWsConnectedRef.current = false;
      },
      onStompError: (frame) => {
        console.error('Erro de protocolo STOMP:', frame.headers['message']);
        isWsConnectedRef.current = false;
      },
      onWebSocketClose: () => {
        isWsConnectedRef.current = false;
      }
    });

    try {
      client.activate();
      stompClientRef.current = client;
    } catch (e) {
      console.warn("Falha imediata de WebSocket. A consola funcionará em modo standalone.", e);
    }

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
        stompClientRef.current = null;
      }
      isWsConnectedRef.current = false;
    };
  }, [activeBus?.busCode]);

  // 6. Manipuladores de Receção de WebSocket
  const handleIncomingOcorrenciaUpdate = (ocorrencia) => {
    const { id, tipoAnomalia, estado } = ocorrencia;
    setLastSync(Date.now());

    if (estado === 'EM_CURSO') {
      setAlertStates(prev => ({
        ...prev,
        [tipoAnomalia]: 'EM_CURSO'
      }));
      setOcorrenciaIds(prev => ({
        ...prev,
        [tipoAnomalia]: id
      }));

      if (escalationTimersRef.current[tipoAnomalia]) {
        clearTimeout(escalationTimersRef.current[tipoAnomalia]);
        delete escalationTimersRef.current[tipoAnomalia];
      }

      const toastKey = `escalada-${tipoAnomalia}`;
      if (toastIdsRef.current[toastKey]) {
        toast.dismiss(toastIdsRef.current[toastKey]);
        delete toastIdsRef.current[toastKey];
      }
    } 
    else if (estado === 'RESOLVIDA' || estado === 'FALSO_POSITIVO') {
      setAlertStates(prev => ({
        ...prev,
        [tipoAnomalia]: 'DISPONIVEL'
      }));
      setOcorrenciaIds(prev => {
        const copy = { ...prev };
        delete copy[tipoAnomalia];
        return copy;
      });

      const toastKey = `escalada-${tipoAnomalia}`;
      if (toastIdsRef.current[toastKey]) {
        toast.dismiss(toastIdsRef.current[toastKey]);
        delete toastIdsRef.current[toastKey];
      }
    }
  };

  const handleIncomingEscalacaoText = (text, busCode) => {
    setLastSync(Date.now());
    if (text.includes(busCode)) {
      let detectType = null;
      for (const alert of ANOMALIAS) {
        if (text.toUpperCase().includes(alert.tipo)) {
          detectType = alert.tipo;
          break;
        }
      }

      if (detectType) {
        setAlertStates(prev => {
          if (prev[detectType] === 'PENDENTE') {
            const label = ANOMALIAS.find(a => a.tipo === detectType)?.label || detectType;
            const toastId = toast.warn(
              <div>
                <strong>⚠️ Alerta Escalado!</strong>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>
                  {label} sem resposta do operador no Centro de Controlo.
                </div>
              </div>,
              {
                position: "top-right",
                autoClose: false,
                closeOnClick: true,
                draggable: false,
              }
            );
            toastIdsRef.current[`escalada-${detectType}`] = toastId;

            return { ...prev, [detectType]: 'ESCALADO' };
          }
          return prev;
        });
      }
    }
  };

  const handleIncomingDispatchMessage = (msgDto) => {
    setLastSync(Date.now());
    // Adiciona apenas se já não existir no feed (pelo UUID de correlação)
    setMessages(prev => {
      const exists = prev.some(m => m.mqttMessageId === msgDto.mqttMessageId);
      if (exists) {
        // Atualiza o estado da mensagem existente (ex: se o operador a cancelou ou se falhou)
        return prev.map(m => m.mqttMessageId === msgDto.mqttMessageId ? msgDto : m);
      } else {
        // Insere a nova mensagem no fim
        return [...prev, msgDto];
      }
    });
  };

  // 7. Ação de Submissão de Alerta (UC6)
  const triggerAlert = async (anomalia) => {
    if (!activeBus) return;
    const tipo = anomalia.tipo;
    const busCode = activeBus.busCode;
    
    // 1. Mudar o estado visual para LOADING
    setAlertStates(prev => ({ ...prev, [tipo]: 'LOADING' }));

    // Simulação de latência de rede realista (300-800ms)
    const latency = Math.floor(Math.random() * 500) + 300;
    
    const requestPayload = {
      ativoId: busCode,
      tipoAtivo: "BUS",
      tipoAnomalia: tipo
    };

    try {
      let mockOcorrenciaId = Math.floor(Math.random() * 1000) + 1;
      
      // Tentar chamada real ao backend se estiver ligado
      if (isWsConnectedRef.current) {
        try {
          const response = await api.post('/ocorrencias', requestPayload);
          if (response.data && response.data.id) {
            mockOcorrenciaId = response.data.id;
          }
        } catch (e) {
          console.warn("REST call falhou no backend real. Fazendo fallback para simulação local.", e);
        }
      }

      // Aguardar latência
      await new Promise(resolve => setTimeout(resolve, latency));

      // 2. Mudar o estado do botão para PENDENTE (a aguardar operador)
      setAlertStates(prev => ({ ...prev, [tipo]: 'PENDENTE' }));
      setOcorrenciaIds(prev => ({ ...prev, [tipo]: mockOcorrenciaId }));

      // 3. Emitir toast verde de envio
      toast.success(
        `✓ Alerta ${anomalia.label} enviado para o Centro de Controlo`,
        {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
        }
      );

      // 4. Agendar simulação local de transição para EM_CURSO após 5s (Mock / Dev)
      setTimeout(() => {
        setAlertStates(prev => {
          // Apenas transita se ainda estiver PENDENTE
          if (prev[tipo] === 'PENDENTE') {
            console.log(`[MOCK] Ocorrência #${mockOcorrenciaId} (${tipo}) assumida pelo operador.`);
            // Simular o evento recebido no WebSocket
            handleIncomingOcorrenciaUpdate({
              id: mockOcorrenciaId,
              ativoId: busCode,
              tipoAnomalia: tipo,
              estado: 'EM_CURSO'
            });
          }
          return prev;
        });
      }, 5000);

      // 5. Agendar simulação local de ESCALAMENTO após 10s se ativo (Mock / Dev)
      if (forceEscalation) {
        const timerId = setTimeout(() => {
          setAlertStates(prev => {
            if (prev[tipo] === 'PENDENTE') {
              console.log(`[MOCK] Ocorrência #${mockOcorrenciaId} (${tipo}) sem resposta. A escalonar...`);
              handleIncomingEscalacaoText(
                `ALERTA ESCALADO (CRÍTICO): A ocorrência crítica #${mockOcorrenciaId} [${tipo}] no ativo ${busCode} está sem responsável há mais de 10s!`,
                busCode
              );
            }
            return prev;
          });
        }, 10000);

        escalationTimersRef.current[tipo] = timerId;
      }

    } catch {
      // Em caso de erro absoluto no tratamento local
      await new Promise(resolve => setTimeout(resolve, latency));
      setAlertStates(prev => ({ ...prev, [tipo]: 'DISPONIVEL' }));
      toast.error(`Falha ao enviar alerta ${anomalia.label}. Tente novamente.`, {
        position: "top-right",
        autoClose: 5000,
      });
    }
  };

  // 8. Ação de Confirmação de Leitura (UC7)
  const confirmRead = async (message) => {
    if (!activeBus) return;
    const msgId = message.mqttMessageId;
    const busCode = activeBus.busCode;
    
    // 1. Mudar estado para loading
    setConfirmingMsgIds(prev => ({ ...prev, [msgId]: true }));

    const latency = Math.floor(Math.random() * 400) + 300; // 300-700ms

    try {
      // Realizar chamada HTTP real se conectado
      if (isWsConnectedRef.current) {
        try {
          await api.post(`/despacho/${busCode}/ack`, {
            messageId: msgId,
            type: "READ"
          });
        } catch (e) {
          console.warn("Chamada REST de ACK falhou. Fazendo fallback para simulação local.", e);
        }
      }

      // Aguardar latência
      await new Promise(resolve => setTimeout(resolve, latency));

      // 2. Transitar badge localmente para LIDA
      setMessages(prev => 
        prev.map(m => m.mqttMessageId === msgId ? { ...m, estado: 'LIDA', timestampLeitura: new Date().toISOString() } : m)
      );

      toast.success("Mensagem marcada como lida", {
        position: "top-right",
        autoClose: 2000,
      });

    } catch {
      toast.error("Erro ao confirmar leitura da mensagem. Tente novamente.", {
        position: "top-right",
        autoClose: 4000,
      });
    } finally {
      setConfirmingMsgIds(prev => ({ ...prev, [msgId]: false }));
    }
  };

  // 9. Ações do Painel de Simulação (SimulatorPanel)
  const simulateIncomingMessage = () => {
    const mockMsg = {
      id: Math.floor(Math.random() * 10000) + 200,
      mqttMessageId: `mock-uuid-${Math.random().toString(36).substr(2, 9)}`,
      conteudo: `[SIMULAÇÃO] Mensagem operacional enviada pelo Centro de Controlo às ${new Date().toLocaleTimeString()}.`,
      estado: 'ENTREGUE',
      operador: 'Operador Central (MOCK)',
      timestampEnvio: new Date().toISOString(),
      timestampEntrega: new Date().toISOString(),
    };

    handleIncomingDispatchMessage(mockMsg);
    toast.info("Nova mensagem simulada recebida no feed", {
      position: "top-right",
      autoClose: 3000,
    });
  };

  const simulateAlertEmCurso = () => {
    if (!activeBus) return;
    const busCode = activeBus.busCode;
    // Encontrar o primeiro alerta que esteja PENDENTE ou ESCALADO para simular transição
    const pendingType = Object.keys(alertStates).find(
      key => alertStates[key] === 'PENDENTE' || alertStates[key] === 'ESCALADO'
    );

    if (pendingType) {
      const dbId = ocorrenciaIds[pendingType] || 999;
      handleIncomingOcorrenciaUpdate({
        id: dbId,
        ativoId: busCode,
        tipoAnomalia: pendingType,
        estado: 'EM_CURSO'
      });
      toast.success(`Alerta de ${pendingType} assumido pelo operador (Simulado).`, {
        position: "top-right",
        autoClose: 3000,
      });
    } else {
      toast.info("Nenhum alerta pendente ou escalado para assumir.", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  const toggleOnlineState = () => {
    if (online) {
      // Simula offline definindo o lastSync para 45s no passado
      setLastSync(Date.now() - 45000);
    } else {
      // Restabelece o online definindo lastSync para agora
      setLastSync(Date.now());
    }
  };

  // 10. Métodos de Autenticação / Setup (Login e Logout)
  const handleKeypadPress = (val) => {
    setLoginError(null);
    if (val === 'CLEAR') {
      setMechanographicInput('');
    } else if (val === 'BACKSPACE') {
      setMechanographicInput(prev => prev.slice(0, -1));
    } else {
      if (mechanographicInput.length < 12) {
        setMechanographicInput(prev => prev + val);
      }
    }
  };

  const handleMockBypass = () => {
    const driverData = {
      id: 1,
      name: 'João Silva',
      mechanographicNumber: '12345'
    };
    const busData = {
      id: 42,
      busCode: 'TUB-42',
      routeCode: '43',
      routeName: 'Avenida Liberdade - Nogueira'
    };
    
    localStorage.setItem('pgu_driver', JSON.stringify(driverData));
    localStorage.setItem('pgu_active_bus', JSON.stringify(busData));
    
    setCurrentDriver(driverData);
    setActiveBus(busData);
    setMessages(HISTORICO_MENSAGENS);
    
    toast.success("Sessão iniciada em Modo Simulação (Offline)", { position: "top-right" });
  };

  const handleLoginSubmit = async () => {
    if (!mechanographicInput) return;
    setLoginLoading(true);
    setLoginError(null);
    
    try {
      let driverList = [];
      let backendFailed = false;

      try {
        const response = await api.get('/drivers');
        driverList = response.data || [];
      } catch (err) {
        console.warn("Falha ao obter motoristas do backend real. Fallback para mock se permitido.", err);
        backendFailed = true;
        if (ENABLE_MOCK_LOGIN_BYPASS) {
          driverList = MOCK_DRIVERS;
          toast.info("A usar dados locais de simulação (Offline)");
        } else {
          throw new Error("Erro de rede ao comunicar com o servidor. Por favor, tente novamente.");
        }
      }
      
      const foundDriver = driverList.find(d => 
        (d.mechanographicNumber && d.mechanographicNumber.toString() === mechanographicInput) ||
        (d.mecanographicNumber && d.mecanographicNumber.toString() === mechanographicInput)
      );
      
      if (!foundDriver) {
        setLoginError("Número mecanográfico não encontrado.");
        setLoginLoading(false);
        return;
      }
      
      let assignment = null;
      if (backendFailed && ENABLE_MOCK_LOGIN_BYPASS) {
        assignment = MOCK_ASSIGNMENTS[foundDriver.id];
      } else {
        try {
          const response = await api.get(`/drivers/${foundDriver.id}`);
          assignment = response.data;
        } catch (err) {
          console.warn("Falha ao obter atribuição do backend. Fallback para mock se permitido.", err);
          if (ENABLE_MOCK_LOGIN_BYPASS) {
            assignment = MOCK_ASSIGNMENTS[foundDriver.id];
          } else {
            throw new Error("Erro ao obter a escala do motorista.");
          }
        }
      }
      
      if (!assignment || !assignment.busId) {
        setLoginError("O motorista não tem nenhuma escala de autocarro ativa no CCO. Por favor, contacte o Centro de Controlo.");
        setLoginLoading(false);
        return;
      }
      
      let busInfo = null;
      if (backendFailed && ENABLE_MOCK_LOGIN_BYPASS) {
        busInfo = MOCK_BUSES[assignment.busId];
      } else {
        try {
          const response = await api.get(`/buses/${assignment.busId}`);
          busInfo = response.data;
        } catch (err) {
          console.warn("Falha ao obter viatura do backend. Fallback para mock se permitido.", err);
          if (ENABLE_MOCK_LOGIN_BYPASS) {
            busInfo = MOCK_BUSES[assignment.busId];
          } else {
            throw new Error("Erro ao obter informações do autocarro associado.");
          }
        }
      }
      
      if (!busInfo) {
        setLoginError("Informações da viatura associada não foram encontradas.");
        setLoginLoading(false);
        return;
      }
      
      const driverData = {
        id: foundDriver.id,
        name: foundDriver.name,
        mechanographicNumber: foundDriver.mechanographicNumber || foundDriver.mecanographicNumber
      };
      
      const busData = {
        id: busInfo.id,
        busCode: busInfo.busCode,
        routeCode: busInfo.routeCode,
        routeName: busInfo.routeName
      };
      
      localStorage.setItem('pgu_driver', JSON.stringify(driverData));
      localStorage.setItem('pgu_active_bus', JSON.stringify(busData));
      
      setCurrentDriver(driverData);
      setActiveBus(busData);
      setMessages(HISTORICO_MENSAGENS);
      
      toast.success(`Sessão iniciada: ${driverData.name}`, { position: "top-right" });
    } catch (err) {
      setLoginError(err.message || "Ocorreu um erro inesperado.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogoutConfirm = async () => {
    setIsLogoutModalOpen(false);
    
    if (currentDriver) {
      try {
        await api.post('/drivers/unassign', { driverId: currentDriver.id });
        toast.success("Turno terminado com sucesso.");
      } catch (err) {
        console.warn("Falha no POST /unassign no backend real.", err);
        toast.info("Turno terminado localmente (Offline).");
      }
    }
    
    localStorage.removeItem('pgu_driver');
    localStorage.removeItem('pgu_active_bus');
    setCurrentDriver(null);
    setActiveBus(null);
    setMechanographicInput('');
    setLoginError(null);
  };

  // Se o motorista não estiver autenticado, renderiza o ecrã de Setup (Login)
  if (!currentDriver) {
    return (
      <div className="driver-setup-container">
        <div className="driver-setup-card">
          <div className="driver-setup-logo-area">
            <span className="driver-setup-logo-icon">🚍</span>
            <h2>PGU - TUB</h2>
            <p>Consola de Bordo do Motorista</p>
          </div>

          <div className="driver-setup-display">
            <label>NÚMERO MECANOGRÁFICO</label>
            <div className="driver-display-input-wrapper">
              <input
                type="text"
                readOnly
                value={mechanographicInput}
                placeholder="Insira o seu código"
                className="driver-display-input"
                id="driver-mechanographic-display"
              />
              {mechanographicInput && (
                <button
                  type="button"
                  className="driver-clear-input-btn"
                  onClick={() => setMechanographicInput('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {loginError && <div className="driver-setup-error">{loginError}</div>}
          {loginLoading && (
            <div className="driver-setup-loading">
              <div className="driver-btn-spinner"></div>
              <span>A carregar detalhes da escala...</span>
            </div>
          )}

          <div className="driver-keypad-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                type="button"
                className="driver-keypad-btn"
                onClick={() => handleKeypadPress(num.toString())}
                disabled={loginLoading}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              className="driver-keypad-btn driver-keypad-btn--danger"
              onClick={() => handleKeypadPress('CLEAR')}
              disabled={loginLoading}
            >
              Limpar
            </button>
            <button
              type="button"
              className="driver-keypad-btn"
              onClick={() => handleKeypadPress('0')}
              disabled={loginLoading}
            >
              0
            </button>
            <button
              type="button"
              className="driver-keypad-btn driver-keypad-btn--warning"
              onClick={() => handleKeypadPress('BACKSPACE')}
              disabled={loginLoading}
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            className="driver-setup-submit-btn"
            onClick={handleLoginSubmit}
            disabled={loginLoading || !mechanographicInput}
            id="driver-setup-confirm-btn"
          >
            Confirmar Entrada
          </button>

          {ENABLE_MOCK_LOGIN_BYPASS && (
            <button
              type="button"
              className="driver-setup-bypass-btn"
              onClick={handleMockBypass}
              disabled={loginLoading}
              id="driver-setup-bypass-btn"
            >
              Iniciar em Modo Simulação (Offline)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`driver-console-root ${!online ? 'offline' : ''}`}>
      {/* Barra de Estado Superior */}
      <StatusBar 
        busId={activeBus?.busCode} 
        online={online} 
        time={time} 
        driverName={currentDriver.name}
        lineCode={activeBus?.routeCode}
        onLogout={() => setIsLogoutModalOpen(true)}
      />

      {/* Área Central Split-Screen */}
      <main className="driver-main-split">
        {/* Painel Esquerdo - Alertas (45%) */}
        <AlertPanel 
          anomalias={ANOMALIAS}
          alertStates={alertStates}
          onAlertClick={triggerAlert}
          online={online}
        />

        {/* Painel Direito - Feed de Mensagens (55%) */}
        <MessageFeed 
          messages={messages}
          onConfirmRead={confirmRead}
          online={online}
          confirmingMsgIds={confirmingMsgIds}
        />
      </main>

      {/* Painel de Controlo do Simulador (Apenas para fins de Dev/Demo) */}
      <SimulatorPanel 
        online={online}
        onToggleOnline={toggleOnlineState}
        onSimulateMessage={simulateIncomingMessage}
        onSimulateEmCurso={simulateAlertEmCurso}
        forceEscalation={forceEscalation}
        onToggleForceEscalation={setForceEscalation}
      />

      {/* Modal de Confirmação para Terminar Turno */}
      <Modal
        open={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
        title="Terminar Turno"
        message="Tem a certeza que deseja terminar o turno atual e desassociar-se desta viatura?"
        type="warning"
        confirmText="Confirmar Saída"
        cancelText="Voltar"
      />
    </div>
  );
}
