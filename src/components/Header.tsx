import { invoke } from '@tauri-apps/api/core';

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

const GITHUB_HOMEPAGE = 'https://github.com/AlpacaKnight/coder-manager';

export function Header({ onCheckUpdates, onUpdateAll, onRefresh, onOpenSettings, isChecking, updateableCount, envCheck, onEnvClick }: HeaderProps) {
  const handleOpenGithub = async () => {
    try {
      await invoke('open_github_homepage');
    } catch (error) {
      console.error('Failed to open GitHub homepage:', error);
      window.open(GITHUB_HOMEPAGE, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="header-brand">
          <button
            type="button"
            className="github-link-btn"
            onClick={handleOpenGithub}
            aria-label="打开 GitHub 首页"
            title="打开 GitHub 首页"
          >
            <svg
              className="github-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18A10.94 10.94 0 0 1 12 6.03c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </button>
          <h1>CLI 工具管理器</h1>
        </div>
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
