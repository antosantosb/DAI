import api from './api';

export const enviarMensagem = (busId, content) =>
  api.post(`/despacho/${busId}/mensagens`, { conteudo: content });

export const reenviarMensagem = (busId, mensagemId) =>
  api.post(`/despacho/${busId}/mensagens/${mensagemId}/reenviar`);

export const cancelarMensagem = (busId, mensagemId) =>
  api.delete(`/despacho/${busId}/mensagens/${mensagemId}`);

export const getMensagens = (busId) =>
  api.get(`/despacho/${busId}/mensagens`);

export const checkOnline = (busId) =>
  api.get(`/despacho/${busId}/online`);
