import api from './api';

export const getOcorrencias = (params) => api.get('/ocorrencias', { params });
export const criarOcorrencia = (body) => api.post('/ocorrencias', body);
export const getOcorrencia = (id) => api.get(`/ocorrencias/${id}`);
export const assumirOcorrencia = (id) => api.post(`/ocorrencias/${id}/assumir`);
export const atribuirOcorrencia = (id, responsavel) => api.post(`/ocorrencias/${id}/atribuir`, { responsavel });
export const fecharOcorrencia = (id, body) => api.post(`/ocorrencias/${id}/fechar`, body);
export const marcarFalsoPositivo = (id, body) => api.post(`/ocorrencias/${id}/falso-positivo`, body);
export const registarAcaoCorretiva = (id, body) => api.post(`/ocorrencias/${id}/acao-corretiva`, body);

export const uploadAnexo = (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/ocorrencias/${id}/anexos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getAnexos = (id) => api.get(`/ocorrencias/${id}/anexos`);
export const getTelemetriaAtivo = (ativoId) => api.get(`/ocorrencias/ativos/${ativoId}/telemetria`);
