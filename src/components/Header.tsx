interface HeaderProps {
  onCheckUpdates: () => void;
  onUpdateAll: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  isChecking: boolean;
  updateableCount: number;
  envCheck: { 
    node_available: boolean; 
    npm_available: boolean; 
    cargo_available: boolean;
    rustc_available: boolean;
    node_version: string | null;
    npm_version: string | null;
    cargo_version: string | null;
    rustc_version: string | null;
  } | null;
  onEnvClick: (envName: string) => void;
}

export function Header({ onCheckUpdates, onUpdateAll, onRefresh, onOpenSettings, isChecking, updateableCount, envCheck, onEnvClick }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-top">
        <h1>CLI 工具管理器</h1>
        <div className="env-status-header">
          {envCheck && (
            <>
              <button 
                className={`env-btn ${envCheck.node_available ? 'available' : 'unavailable'}`}
                onClick={() => onEnvClick('node')}
              >
                Node.js {envCheck.node_available ? '✅' : '❌'}
              </button>
              <button 
                className={`env-btn ${envCheck.npm_available ? 'available' : 'unavailable'}`}
                onClick={() => onEnvClick('npm')}
              >
                npm {envCheck.npm_available ? '✅' : '❌'}
              </button>
              <button 
                className={`env-btn ${envCheck.cargo_available ? 'available' : 'unavailable'}`}
                onClick={() => onEnvClick('cargo')}
              >
                Cargo {envCheck.cargo_available ? '✅' : '❌'}
              </button>
              <button 
                className={`env-btn ${envCheck.rustc_available ? 'available' : 'unavailable'}`}
                onClick={() => onEnvClick('rustc')}
              >
                Rust {envCheck.rustc_available ? '✅' : '❌'}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="header-actions">
        <button 
          className="btn-primary"
          onClick={onCheckUpdates}
          disabled={isChecking}
        >
          {isChecking ? '检查中...' : '检查更新'}
        </button>
        <button
          className="btn-secondary"
          onClick={onUpdateAll}
          disabled={isChecking || updateableCount === 0}
        >
          {updateableCount > 0 ? `更新全部 (${updateableCount})` : '更新全部'}
        </button>
        <button className="btn-secondary" onClick={onRefresh}>
          刷新
        </button>
        <button className="btn-settings" onClick={onOpenSettings}>
          ⚙️
        </button>
      </div>
    </header>
  );
}
