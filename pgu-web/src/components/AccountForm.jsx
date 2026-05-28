// Sprint 0: formulario reusable para self-service de conta.
// Usado em /backoffice/conta (MinhaConta page) e no modal "Conta" do PainelBordo.
//
// Props:
//   initialData     { firstName, lastName, username, email, avatarUrl }
//   onSaveProfile   async (patch) => updated user
//   onChangePassword async (currentPassword, newPassword) => void
//   onUploadAvatar  async (File) => { avatarUrl } (opcional)
//   onDeleteAvatar  async () => void (opcional)
//   compact         boolean — layout mais denso para o modal do Painel de Bordo
//
// Toasts e' o consumidor que dispara (depois da promise resolver/falhar).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthProvider';
import Avatar from './Avatar';
import PasswordInput from './PasswordInput';
import './AccountForm.css';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export default function AccountForm({
  initialData,
  onSaveProfile,
  onChangePassword,
  onUploadAvatar,
  onDeleteAvatar,
  compact = false,
}) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  // Sprint 0 (follow-up): admin nao pode mudar o proprio username — quebra
  // referencias historicas (audit_log, drivers, exports, etc.) e o token JWT
  // emitido pelo Keycloak continua a apontar ao username antigo ate refresh.
  const isAdmin = hasRole('admin');
  // Sprint 1 follow-up: dev tambem nao pode editar perfil (nome/username/email).
  // Conta de sistema — so' password e' editavel.
  const isDeveloper = hasRole('developer');
  const isProtected = isAdmin || isDeveloper;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  // previewUrl: object URL local para feedback imediato durante upload.
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const fileInputRef = useRef(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwError, setPwError] = useState(null);

  useEffect(() => {
    if (!initialData) return;
    setFirstName(initialData.firstName || '');
    setLastName(initialData.lastName || '');
    setUsername(initialData.username || '');
    setEmail(initialData.email || '');
    setAvatarUrl(initialData.avatarUrl || null);
  }, [initialData]);

  // Libertar object URL ao desmontar para evitar fuga de memoria.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const displayName =
    [firstName, lastName].filter(Boolean).join(' ').trim() || username || '?';
  const effectiveAvatarUrl = previewUrl || avatarUrl;

  const handlePickFile = () => {
    setAvatarError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permitir voltar a escolher o mesmo ficheiro
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t('pages.minhaConta.photoBadType'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t('pages.minhaConta.photoTooBig'));
      return;
    }

    if (!onUploadAvatar) {
      setAvatarError(t('toasts.operationFailed'));
      return;
    }

    // Preview optimista enquanto o upload nao terminar.
    const objUrl = URL.createObjectURL(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(objUrl);
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const newUrl = await onUploadAvatar(file);
      if (newUrl) setAvatarUrl(newUrl);
      URL.revokeObjectURL(objUrl);
      setPreviewUrl(null);
    } catch (err) {
      URL.revokeObjectURL(objUrl);
      setPreviewUrl(null);
      const code = err?.response?.data?.error;
      if (code === 'file_too_large') {
        setAvatarError(t('pages.minhaConta.photoTooBig'));
      } else if (code === 'unsupported_type') {
        setAvatarError(t('pages.minhaConta.photoBadType'));
      } else {
        setAvatarError(err?.response?.data?.message || err?.message || t('toasts.operationFailed'));
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!onDeleteAvatar || uploadingAvatar) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      await onDeleteAvatar();
      setAvatarUrl(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      setAvatarError(err?.message || t('toasts.operationFailed'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const patch = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      };
      // Admin nao pode mudar o proprio username; nao incluir no payload.
      if (!isProtected) patch.username = username.trim();
      await onSaveProfile(patch);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (savingPassword) return;
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setPwError(t('pages.minhaConta.passwordsDontMatch'));
      return;
    }
    setSavingPassword(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const isWrong = err?.response?.status === 401
        || err?.response?.data?.error === 'current_password_wrong';
      setPwError(isWrong
        ? t('pages.minhaConta.currentPasswordWrong')
        : (err?.message || t('toasts.operationFailed')));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className={`account-form ${compact ? 'account-form--compact' : ''}`}>
      <form className="account-section" onSubmit={handleSaveProfile}>
        <div className="account-section-header account-section-header--avatar">
          <div className="account-avatar-wrap">
            <Avatar
              url={effectiveAvatarUrl}
              name={displayName}
              size={compact ? 'lg' : 'xl'}
            />
            {uploadingAvatar && <div className="account-avatar-overlay" aria-hidden="true" />}
          </div>
          <div className="account-avatar-info">
            <h3 className="account-section-title">{t('pages.minhaConta.photoSection')}</h3>
            <p className="account-section-hint">{t('pages.minhaConta.subtitle')}</p>
            <div className="account-avatar-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                aria-hidden="true"
              />
              <button
                type="button"
                className="account-btn account-btn--secondary"
                onClick={handlePickFile}
                disabled={uploadingAvatar || !onUploadAvatar}
              >
                {uploadingAvatar
                  ? t('pages.minhaConta.uploading')
                  : t('pages.minhaConta.changePhoto')}
              </button>
              {avatarUrl && onDeleteAvatar && (
                <button
                  type="button"
                  className="account-btn account-btn--ghost"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                >
                  {t('pages.minhaConta.removePhoto')}
                </button>
              )}
            </div>
            {avatarError && (
              <div className="account-error account-error--inline" role="alert">{avatarError}</div>
            )}
          </div>
        </div>

        <div className="account-grid">
          <label className="account-field">
            <span>{t('pages.minhaConta.firstName')}</span>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              disabled={isProtected}
              readOnly={isProtected}
              title={isProtected ? t('pages.minhaConta.profileLocked') : undefined}
            />
          </label>
          <label className="account-field">
            <span>{t('pages.minhaConta.lastName')}</span>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              disabled={isProtected}
              readOnly={isProtected}
              title={isProtected ? t('pages.minhaConta.profileLocked') : undefined}
            />
          </label>
          <label className="account-field">
            <span>{t('pages.minhaConta.username')}</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={isProtected}
              readOnly={isProtected}
              title={isProtected ? t('pages.minhaConta.profileLocked') : undefined}
            />
          </label>
          <label className="account-field">
            <span>{t('pages.minhaConta.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={isProtected}
              readOnly={isProtected}
              title={isProtected ? t('pages.minhaConta.profileLocked') : undefined}
            />
          </label>
        </div>

        {isProtected && (
          <div className="account-locked-banner" role="note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>{t('pages.minhaConta.profileLocked')}</span>
          </div>
        )}

        {!isProtected && (
          <div className="account-actions">
            <button
              type="submit"
              className="account-btn account-btn--primary"
              disabled={savingProfile}
            >
              {savingProfile ? t('common.loading') : t('pages.minhaConta.saveProfile')}
            </button>
          </div>
        )}
      </form>

      <form className="account-section" onSubmit={handleChangePassword}>
        <div className="account-section-header">
          <h3 className="account-section-title">{t('pages.minhaConta.passwordSection')}</h3>
        </div>
        <div className="account-grid">
          <label className="account-field">
            <span>{t('pages.minhaConta.currentPassword')}</span>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="account-field">
            <span>{t('pages.minhaConta.newPassword')}</span>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="account-field">
            <span>{t('pages.minhaConta.confirmPassword')}</span>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
        {pwError && <div className="account-error" role="alert">{pwError}</div>}
        <div className="account-actions">
          <button
            type="submit"
            className="account-btn account-btn--primary"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {savingPassword ? t('common.loading') : t('pages.minhaConta.savePassword')}
          </button>
        </div>
      </form>
    </div>
  );
}
