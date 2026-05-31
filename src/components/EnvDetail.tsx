interface EnvInfo {
  name: string;
  displayName: string;
  available: boolean;
  version: string | null;
  path: string | null;
  installCommand: string;
  updateCommand?: string;
}

interface EnvDetailProps {
  envInfo: EnvInfo | null;
  onClose: () => void;
  onInstall?: () => void;
  onUpdate?: () => void;
  isInstalling?: boolean;
  isUpdating?: boolean;
}

export function EnvDetail({ envInfo, onClose, onInstall, onUpdate, isInstalling = false, isUpdating = false }: EnvDetailProps) {
  if (!envInfo) return null;

  return (
    <div className="env-detail-overlay" onClick={onClose}>
      <div className="env-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="env-detail-header">
          <h2>{envInfo.displayName}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="env-detail-content">
          {envInfo.available ? (
            <div className="env-info-available">
              <div className="status-badge status-updated">
                已安装 ✅
              </div>
              
              <div className="env-detail-info">
                <div className="info-row">
                  <span className="label">版本：</span>
                  <span className="value">{envInfo.version || '未知'}</span>
                </div>
                {envInfo.path && (
                  <div className="info-row">
                    <span className="label">安装路径：</span>
                    <span className="value path">{envInfo.path}</span>
                  </div>
                )}
              </div>

              {envInfo.updateCommand && (
                <div className="env-detail-actions">
                  <button 
                    className="btn-update" 
                    onClick={onUpdate}
                    disabled={isUpdating}
                  >
                    {isUpdating ? '更新中...' : '更新'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="env-info-not-available">
              <div className="status-badge status-not-installed">
                未安装 ❌
              </div>
              
              <div className="env-detail-info">
                <div className="info-row">
                  <span className="label">安装方法：</span>
                </div>
                <div className="info-row install-command">
                  <code>{envInfo.installCommand}</code>
                </div>
              </div>

              <div className="env-detail-actions">
                <button 
                  className="btn-install" 
                  onClick={onInstall}
                  disabled={isInstalling}
                >
                  {isInstalling ? '安装中...' : '自动安装'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
