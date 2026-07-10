import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CliTool } from '../types';

interface ToolDetailProps {
  tool: CliTool | null;
  onUpdate: (name: string) => void;
  onInstall?: (name: string) => void;
  onUninstall?: (name: string) => void;
  onIgnore: (name: string) => void;
  onRecheck?: (name: string) => void;
  onOpenModelConfig?: () => void;
  onOpenKimiModelConfig?: () => void;
  onOpenOpenCodeModelConfig?: () => void;
  onOpenCodeBuddyModelConfig?: () => void;
  isUpdating: boolean;
  isRechecking?: boolean;
  activeAction?: 'update' | 'install' | 'uninstall' | null;
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

export function ToolDetail({ tool, onUpdate, onInstall, onUninstall, onIgnore, onRecheck, onOpenModelConfig, onOpenKimiModelConfig, onOpenOpenCodeModelConfig, onOpenCodeBuddyModelConfig, isUpdating, isRechecking, activeAction }: ToolDetailProps) {
  const [updateCommand, setUpdateCommand] = useState<string | null>(null);
  const [modalCmd, setModalCmd] = useState<{ title: string; cmd: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // 复制命令到剪贴板，并短暂提示"已复制"
  const copyToClipboard = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // 剪贴板失败时退回选中文本供用户手动复制
    });
  };

  useEffect(() => {
    if (!tool?.name) return;
    let stale = false;
    invoke<string | null>('get_tool_update_command', { name: tool.name })
      .then((cmd) => { if (!stale) setUpdateCommand(cmd); })
      .catch(() => { if (!stale) setUpdateCommand(null); });
    return () => { stale = true; };
  }, [tool?.name]);

  if (!tool) {
    return <div className="tool-detail empty">选择一个工具查看详情</div>;
  }

  const currentAction = activeAction ?? null;
  const isBusy = isUpdating || currentAction !== null;
  const isInstalled = tool.status !== 'NotInstalled' && Boolean(tool.current_version);
  const canRecheck = !isRechecking && !isBusy;

  const handleStatusClick = () => {
    if (canRecheck && onRecheck) {
      onRecheck(tool.name);
    }
  };

  return (
    <div className="tool-detail">
      <div className="detail-header">
        <h2>{tool.display_name}</h2>
        <span
          className={`status-badge status-${statusClasses[tool.status]}${canRecheck ? ' clickable' : ''}`}
          onClick={handleStatusClick}
          title={canRecheck ? '点击重新检查' : undefined}
        >
          {isRechecking ? '检查中...' : statusLabels[tool.status]}
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
        {isInstalled && !tool.ignored && tool.can_auto_update && (
          <button
            className="btn-update"
            onClick={() => onUpdate(tool.name)}
            disabled={isBusy}
          >
            {currentAction === 'update' ? '更新中...' : '更新'}
          </button>
        )}

        {isInstalled && updateCommand && (
          <button
            className="btn-install-manual"
            onClick={() => setModalCmd({ title: '更新命令', cmd: updateCommand })}
          >
            查看更新命令
          </button>
        )}

        {isInstalled && !tool.ignored && (
          <button
            className="btn-uninstall"
            onClick={() => onUninstall?.(tool.name)}
            disabled={isBusy}
          >
            {currentAction === 'uninstall' ? '卸载中...' : '卸载'}
          </button>
        )}

        {isInstalled && !tool.ignored && (
          <button
            className="btn-ignore"
            onClick={() => onIgnore(tool.name)}
            disabled={isBusy}
          >
            忽略
          </button>
        )}

        {tool.name === 'qwen' && (
          <button
            className="btn-model-config"
            onClick={() => onOpenModelConfig?.()}
          >
            配置模型
          </button>
        )}

        {tool.name === 'kimi' && (
          <button
            className="btn-model-config"
            onClick={() => onOpenKimiModelConfig?.()}
          >
            配置模型
          </button>
        )}

        {tool.name === 'opencode' && (
          <button
            className="btn-model-config"
            onClick={() => onOpenOpenCodeModelConfig?.()}
          >
            配置模型
          </button>
        )}

        {tool.name === 'codebuddy' && (
          <button
            className="btn-model-config"
            onClick={() => onOpenCodeBuddyModelConfig?.()}
          >
            配置模型
          </button>
        )}

        {tool.status === 'NotInstalled' && (
          <>
            <button
              className="btn-install"
              onClick={() => onInstall?.(tool.name)}
              disabled={isBusy || !tool.can_auto_update}
            >
              {currentAction === 'install' ? '安装中...' : '执行安装'}
            </button>
            <button
              className="btn-install-manual"
              onClick={() => {
                if (tool.install_command) {
                  setModalCmd({ title: '安装命令', cmd: tool.install_command });
                }
              }}
            >
              查看安装命令
            </button>
          </>
        )}
      </div>

      {modalCmd && (
        <div className="command-modal-overlay" onClick={() => setModalCmd(null)}>
          <div className="command-modal" onClick={(e) => e.stopPropagation()}>
            <div className="command-modal-header">
              <h3>{modalCmd.title}</h3>
            </div>
            <pre className="command-modal-body">{modalCmd.cmd}</pre>
            <div className="command-modal-actions">
              <button
                className="btn-copy"
                onClick={() => copyToClipboard(modalCmd.cmd)}
              >
                {copied ? '✓ 已复制' : '复制'}
              </button>
              <button
                className="btn-close-modal"
                onClick={() => setModalCmd(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
