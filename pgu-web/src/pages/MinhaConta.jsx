// Sprint 0: pagina de self-service de conta (qualquer authenticated).
// Endpoint backend: /api/v1/me (GET/PATCH) + /api/v1/me/password (POST).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import api from '../services/api';
import AccountForm from '../components/AccountForm';
import './MinhaConta.css';

export default function MinhaConta() {
  const { t } = useTranslation();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/me')
      .then(({ data }) => setMe(data))
      .catch(() => toast.error(t('toasts.loadFailed'), { toastId: 'me-load-failed' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async (patch) => {
    try {
      const { data } = await api.patch('/me', patch);
      setMe(data);
      toast.success(t('pages.minhaConta.profileSaved'));
    } catch (err) {
      toast.error(err?.response?.data?.error || t('toasts.operationFailed'));
      throw err;
    }
  };

  const handleChangePassword = async (currentPassword, newPassword) => {
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      toast.success(t('pages.minhaConta.passwordChanged'));
    } catch (err) {
      // Deixa o componente apresentar a mensagem inline; relancamos
      // para o AccountForm distinguir 401 (password atual errada).
      throw err;
    }
  };

  const handleUploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (data?.avatarUrl) {
      setMe((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      // Notifica o resto da app (Layout, etc.) para atualizar o avatar.
      window.dispatchEvent(new CustomEvent('pgu:avatar-updated', { detail: { avatarUrl: data.avatarUrl } }));
    }
    toast.success(t('pages.minhaConta.photoUploaded'));
    return data?.avatarUrl;
  };

  const handleDeleteAvatar = async () => {
    await api.delete('/me/avatar');
    setMe((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
    window.dispatchEvent(new CustomEvent('pgu:avatar-updated', { detail: { avatarUrl: null } }));
    toast.success(t('pages.minhaConta.photoRemoved'));
  };

  return (
    <div className="minha-conta-page">
      <header className="minha-conta-header">
        <h1>{t('pages.minhaConta.title')}</h1>
        <p className="minha-conta-subtitle">{t('pages.minhaConta.subtitle')}</p>
      </header>

      {loading ? (
        <div className="minha-conta-loading">{t('common.loading')}</div>
      ) : (
        <AccountForm
          initialData={me}
          onSaveProfile={handleSaveProfile}
          onChangePassword={handleChangePassword}
          onUploadAvatar={handleUploadAvatar}
          onDeleteAvatar={handleDeleteAvatar}
        />
      )}
    </div>
  );
}
