import type { AppConfig } from '../types';

interface SettingsProps {
  config: AppConfig;
  onUnignore: (name: string) => void;
  onClearIgnored: () => void;
  onClose: () => void;
}

export function Settings({ config, onUnignore, onClearIgnored, onClose }: SettingsProps) {
  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-content">
          <h3>已忽略的工具</h3>
          {config.ignored_tools.length === 0 ? (
            <p className="empty-message">暂无忽略的工具</p>
          ) : (
            <>
              <ul className="ignored-list">
                {config.ignored_tools.map((tool) => (
                  <li key={tool}>
                    <span>{tool}</span>
                    <button onClick={() => onUnignore(tool)}>取消忽略</button>
                  </li>
                ))}
              </ul>
              <button className="btn-clear" onClick={onClearIgnored}>
                清空忽略列表
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
