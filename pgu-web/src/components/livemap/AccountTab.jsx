export default function AccountTab() {
  return (
    <div className="livemap-account">
      <div className="livemap-account-avatar">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>
      <div className="livemap-account-info">
        <span className="livemap-account-name">Utilizador</span>
        <span className="livemap-account-email">user@tub.pt</span>
        <span className="livemap-account-role">Administrador</span>
      </div>
      <button className="livemap-btn-logout">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
        Terminar Sessao
      </button>
    </div>
  );
}
