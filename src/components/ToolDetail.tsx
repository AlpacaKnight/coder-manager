import type { CliTool } from '../types';

interface ToolDetailProps {
  tool: CliTool | null;
  onUpdate: (name: string) => void;
  onInstall?: (name: string) => void;
  onIgnore: (name: string) => void;
  isUpdating: boolean;
}

const statusLabels: Record<string, string> = {
  UpToDate: '已是最新版本',
  UpdateAvailable: '有可用更新',
  ManualUpdate: '需手动检查',
  NotInstalled: '未安装',
  Ignored: '已忽略',
  Error: '检查出错',
  Checking: '检查中',
};

const statusClasses: Record<string, string> = {
  UpToDate: 'updated',
  UpdateAvailable: 'updateavailable',
  ManualUpdate: 'manualupdate',
  NotInstalled: 'notinstalled',
  Ignored: 'ignored',
  Error: 'error',
  Checking: 'checking',
};

export function ToolDetail({ tool, onUpdate, onInstall, onIgnore, isUpdating }: ToolDetailProps) {
  if (!tool) {
    return <div className="tool-detail empty">选择一个工具查看详情</div>;
  }

  return (
    <div className="tool-detail">
      <div className="detail-header">
        <h2>{tool.display_name}</h2>
        <span className={`status-badge status-${statusClasses[tool.status]}`}>
          {statusLabels[tool.status]}
        </span>
      </div>
      
      <div className="detail-info">
        <div className="info-row">
          <span className="label">当前版本:</span>
          <span className="value">{tool.current_version || 'N/A'}</span>
        </div>
        
        {tool.latest_version && (
          <div className="info-row">
            <span className="label">最新版本:</span>
            <span className="value">{tool.latest_version}</span>
          </div>
        )}
        
        {tool.path && (
          <div className="info-row">
            <span className="label">安装路径:</span>
            <span className="value path">{tool.path}</span>
          </div>
        )}
        
        <div className="info-row">
          <span className="label">自动更新:</span>
          <span className="value">{tool.can_auto_update ? '支持' : '不支持'}</span>
        </div>
      </div>
      
      <div className="detail-actions">
        {tool.status !== 'NotInstalled' && !tool.ignored && tool.can_auto_update && (
          <button
            className="btn-update"
            onClick={() => onUpdate(tool.name)}
            disabled={isUpdating}
          >
            {isUpdating ? '更新中...' : '更新'}
          </button>
        )}

        {tool.status !== 'NotInstalled' && tool.update_command && (
          <button
            className="btn-install-manual"
            onClick={() => {
              alert(`更新命令: ${tool.update_command}`);
            }}
          >
            查看更新命令
          </button>
        )}

        {!tool.ignored && tool.status !== 'NotInstalled' && (
          <button
            className="btn-ignore"
            onClick={() => onIgnore(tool.name)}
          >
            忽略
          </button>
        )}

        {tool.status === 'NotInstalled' && (
          <>
            <button
              className="btn-install"
              onClick={() => onInstall?.(tool.name)}
              disabled={isUpdating || !tool.can_auto_update}
            >
              {isUpdating ? '安装中...' : '执行安装'}
            </button>
            <button
              className="btn-install-manual"
              onClick={() => {
                if (tool.install_command) {
                  alert(`安装命令: ${tool.install_command}`);
                }
              }}
            >
              查看安装命令
            </button>
          </>
        )}
      </div>
    </div>
  );
}
