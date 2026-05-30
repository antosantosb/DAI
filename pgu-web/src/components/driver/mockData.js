export const ANOMALIAS = [
  { label: 'Sobreaquecimento', tipo: 'SOBREAQUECIMENTO', critica: true, icone: '🔥' },
  { label: 'Falha Carregador', tipo: 'FALHA_CARREGADOR', critica: true, icone: '⚡' },
  { label: 'Bateria Crítica', tipo: 'BATERIA_CRITICA', critica: true, icone: '🔋' },
  { label: 'Problema Passageiro', tipo: 'PROBLEMA_PASSAGEIRO', critica: false, icone: '🚨' },
  { label: 'Avaria Mecânica', tipo: 'AVARIA_MECANICA', critica: false, icone: '🔧' },
  { label: 'Desvio de Rota', tipo: 'DESVIO_ROTA', critica: false, icone: '🚧' },
];

export const HISTORICO_MENSAGENS = [
  {
    id: 101,
    mqttMessageId: '98bf2c3b-74f0-46d5-a3d8-5f2de41006e8',
    conteudo: 'Atenção motorista: Desvio temporário na Avenida da Liberdade devido a evento municipal. Siga o percurso alternativo indicado.',
    estado: 'LIDA',
    operador: 'Carlos Silva (CCO)',
    timestampEnvio: new Date(Date.now() - 30 * 60000).toISOString(), // 30 min atrás
    timestampEntrega: new Date(Date.now() - 29 * 60000).toISOString(),
    timestampLeitura: new Date(Date.now() - 28 * 60000).toISOString(),
  },
  {
    id: 102,
    mqttMessageId: '47d8b560-84a1-432d-9bf9-9c5950d99ef8',
    conteudo: 'Mensagem urgente: Confirmar se a contagem de passageiros na linha 43 está em conformidade com o sensor de porta.',
    estado: 'ENTREGUE',
    operador: 'Ana Rodrigues (CCO)',
    timestampEnvio: new Date(Date.now() - 5 * 60000).toISOString(), // 5 min atrás
    timestampEntrega: new Date(Date.now() - 4.8 * 60000).toISOString(),
  },
  {
    id: 103,
    mqttMessageId: 'bf1bcfb0-5755-46ee-8df3-37b9dc07455d',
    conteudo: 'Solicitação de paragem técnica agendada para o posto de carregamento norte. Aguardar instruções adicionais.',
    estado: 'FALHOU',
    operador: 'Sistema',
    timestampEnvio: new Date(Date.now() - 15 * 60000).toISOString(), // 15 min atrás
    erroDetalhe: 'TIMEOUT: Viatura offline ou incapaz de receber a mensagem em 10 segundos.'
  }
];

export const MOCK_DRIVERS = [
  { id: 1, name: 'João Silva', mechanographicNumber: '12345', status: 'ON_DUTY' },
  { id: 2, name: 'António Santos', mechanographicNumber: '67890', status: 'AVAILABLE' },
  { id: 3, name: 'Maria Ferreira', mechanographicNumber: '54321', status: 'AVAILABLE' },
];

export const MOCK_ASSIGNMENTS = {
  1: { id: 10, driverId: 1, busId: 42, active: true }, // João Silva -> Bus 42
  2: { id: 11, driverId: 2, busId: null, active: false }, // António Santos -> Sem autocarro
  3: { id: 12, driverId: 3, busId: 43, active: true }, // Maria Ferreira -> Bus 43
};

export const MOCK_BUSES = {
  42: { id: 42, busCode: 'TUB-42', licensePlate: 'AA-00-XX', routeId: 1, routeCode: '43', routeName: 'Avenida Liberdade - Nogueira' },
  43: { id: 43, busCode: 'TUB-88', licensePlate: 'BB-11-YY', routeId: 2, routeCode: '02', routeName: 'Ponte de Lima - Braga' },
};

