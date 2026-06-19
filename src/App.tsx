import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ToolList } from './components/ToolList';
import { ToolDetail } from './components/ToolDetail';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { Settings } from './pages/Settings';
import { ModelConfig } from './pages/ModelConfig';
import { KimiModelConfig } from './pages/KimiModelConfig';
import { OpenCodeModelConfig } from './pages/OpenCodeModelConfig';
import { CodeBuddyModelConfig } from './pages/CodeBuddyModelConfig';
import { ProviderManagement } from './pages/ProviderManagement';
import { EnvDetail } from './components/EnvDetail';
import type { CliTool, EnvCheck, AppConfig, ToolStatus } from './types';
import './App.css';

interface EnvInfo {
  name: string;
  displayName: string;
  available: boolean;
  version: string | null;
  path: string | null;
  installCommand: string;
  updateCommand?: string;
}

const VERSION_CHECK_CONCURRENCY = 3;

type ToolAction = 'update' | 'install' | 'uninstall';

function App() {
  const [tools, setTools] = useState<CliTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<CliTool | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [config, setConfig] = useState<AppConfig>({ ignored_tools: [], last_check_time: null, tool_order: [], providers: [] });
  const configRef = useRef(config);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [showKimiModelConfig, setShowKimiModelConfig] = useState(false);
  const [showOpenCodeModelConfig, setShowOpenCodeModelConfig] = useState(false);
  const [showCodeBuddyModelConfig, setShowCodeBuddyModelConfig] = useState(false);
  const [showProviderMgmt, setShowProviderMgmt] = useState(false);
  const [previousPage, setPreviousPage] = useState<'home' | 'model-config' | 'kimi-model-config' | 'opencode-model-config' | 'codebuddy-model-config'>('home');
  const [isChecking, setIsChecking] = useState(false);
  const [updatingTools, setUpdatingTools] = useState<Record<string, boolean>>({});
  const [toolActions, setToolActions] = useState<Record<string, ToolAction>>({});
  const [selectedEnv, setSelectedEnv] = useState<EnvInfo | null>(null);
  const [isInstalling] = useState(false);
  const [isEnvUpdating] = useState(false);
  const [isCheckingBackground, setIsCheckingBackground] = useState(false);

  // 计算全局是否在更新（供 Header 使用避免冲突）
  const isUpdating = Object.values(updatingTools).some(Boolean);

  const setToolAction = useCallback((name: string, action: ToolAction | null) => {
    setToolActions((prev) => {
      if (action) {
        return { ...prev, [name]: action };
      }

      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const applyConfig = useCallback((nextConfig: AppConfig) => {
    configRef.current = nextConfig;
    setConfig(nextConfig);
  }, []);

  const persistLastCheckTime = useCallback(async () => {
    const nextConfig: AppConfig = {
      ...configRef.current,
      last_check_time: String(Math.floor(Date.now() / 1000)),
    };

    applyConfig(nextConfig);

    try {
      await invoke('save_config', { newConfig: nextConfig });
    } catch (error) {
      console.error('Failed to save last check time:', error);
    }
  }, [applyConfig]);

  // 封装：渐进式检查单个 CLI 工具的最新版本
  const checkSingleToolUpdate = useCallback(async (toolName: string, currentVersion: string) => {
    try {
      const latest = await invoke<string | null>('get_tool_latest_version', { name: toolName });
      
      setTools((prevTools) =>
        prevTools.map((t) => {
          if (t.name === toolName) {
            const hasLatest = latest !== null;
            const updateAvailable = hasLatest && latest !== currentVersion;
            let nextStatus: ToolStatus;
            if (t.ignored) {
              nextStatus = 'Ignored';
            } else if (currentVersion === '') {
              nextStatus = 'NotInstalled';
            } else if (hasLatest) {
              nextStatus = updateAvailable ? 'UpdateAvailable' : 'UpToDate';
            } else {
              nextStatus = t.can_auto_update ? 'Error' : 'ManualUpdate';
            }

            const updatedTool: CliTool = {
              ...t,
              latest_version: latest,
              update_available: updateAvailable,
              status: nextStatus,
            };

            // 如果当前在详情页选中的是这个工具，也要顺便热更新一下状态
            setSelectedTool((curr) => {
              if (curr && curr.name === toolName) {
                return updatedTool;
              }
              return curr;
            });

            return updatedTool;
          }
          return t;
        })
      );
    } catch (err) {
      console.error(`Failed to get version for ${toolName}:`, err);
      // 检查失败退回先前本地估算出的版本状态
      setTools((prevTools) =>
        prevTools.map((t) => {
          if (t.name === toolName) {
            const nextStatus: ToolStatus = t.current_version ? 'Error' : 'NotInstalled';
            const updatedTool = {
              ...t,
              status: nextStatus,
            };

            setSelectedTool((curr) => {
              if (curr && curr.name === toolName) {
                return updatedTool;
              }
              return curr;
            });

            return updatedTool;
          }
          return t;
        })
      );
    }
  }, []);

  // 批量并发检查版本
  const batchCheckUpdates = useCallback(async (toolsToCheck: CliTool[]) => {
    for (let i = 0; i < toolsToCheck.length; i += VERSION_CHECK_CONCURRENCY) {
      const batch = toolsToCheck.slice(i, i + VERSION_CHECK_CONCURRENCY);
      await Promise.all(
        batch.map((tool) => checkSingleToolUpdate(tool.name, tool.current_version)),
      );
    }
  }, [checkSingleToolUpdate]);

  // 触发所有已安装工具的网络最新版本查询（纯异步并发）
  const triggerNetworkChecks = useCallback(async (currentTools: CliTool[]) => {
    setIsCheckingBackground(true);
    const toolsToCheck = currentTools.filter((tool) => !tool.ignored && tool.current_version);

    setTools((prevTools) =>
      prevTools.map((tool) =>
        toolsToCheck.some((candidate) => candidate.name === tool.name)
          ? { ...tool, status: 'Checking' }
          : tool,
      ),
    );

    try {
      await batchCheckUpdates(toolsToCheck);
      await persistLastCheckTime();
    } finally {
      setIsCheckingBackground(false);
    }
  }, [batchCheckUpdates, persistLastCheckTime]);

  const reloadToolsFromLocal = useCallback(async (selectedName: string | null = null) => {
    const toolsData = await invoke<CliTool[]>('get_tools_quick');
    setTools(toolsData);
    setSelectedTool(selectedName ? toolsData.find((tool) => tool.name === selectedName) ?? null : null);
    await triggerNetworkChecks(toolsData);
  }, [triggerNetworkChecks]);

  const loadInitialData = useCallback(async () => {
    try {
      // Phase 1: 真正毫秒级秒开 — 仅获取工具名称和排序，读取配置
      const [namesTools, configData] = await Promise.all([
        invoke<CliTool[]>('get_tool_names'),
        invoke<AppConfig>('get_config'),
      ]);
      setTools(namesTools);
      applyConfig(configData);

      // Phase 1.5: 异步检测顶部环境栏（不和核心列表绑定，防止 Node 等外部启动慢导致白屏卡住）
      void (async () => {
        try {
          const envData = await invoke<EnvCheck>('get_env_check');
          setEnvCheck(envData);
        } catch (err) {
          console.error('Environment check failed:', err);
        }
      })();

      // Phase 2: 后台秒级别拉本地工具安装版本（不涉及任何网络开销，纯本地 child-processes，几乎瞬间完成）
      setIsCheckingBackground(true);
      let latestQuickTools: CliTool[] = [];
      try {
        latestQuickTools = await invoke<CliTool[]>('get_tools_quick');
        setTools(latestQuickTools);
      } catch (err) {
        console.error('Quick detection failed:', err);
        latestQuickTools = namesTools;
      }

      // Phase 3: 后台逐个优雅异步发起最新版本请求（并发管线、各查各的、阻断整体卡顿）
      await triggerNetworkChecks(latestQuickTools);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }, [applyConfig, triggerNetworkChecks]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadInitialData();
    });
  }, [loadInitialData]);

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    try {
      const toolsToCheck = tools.filter((tool) => !tool.ignored && tool.current_version);
      await batchCheckUpdates(toolsToCheck);
      await persistLastCheckTime();
    } catch (error) {
      console.error('Failed to check updates:', error);
    }
    setIsChecking(false);
  };

  const handleRefresh = async () => {
    try {
      await reloadToolsFromLocal();
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  };

  const handleUpdate = async (name: string) => {
    setUpdatingTools(prev => ({ ...prev, [name]: true }));
    setToolAction(name, 'update');
    try {
      await invoke('update_tool', { name });
      await reloadToolsFromLocal(name);
    } catch (error) {
      console.error('Failed to update:', error);
      alert(`更新失败: ${error}`);
    } finally {
      setUpdatingTools(prev => ({ ...prev, [name]: false }));
      setToolAction(name, null);
    }
  };

  const handleUpdateAll = async () => {
    const names = tools
      .filter((tool) => tool.update_available && tool.can_auto_update && !tool.ignored)
      .map((tool) => tool.name);

    if (names.length === 0) return;

    // 将所有这些工具标记为更新中
    const updateStarted: Record<string, boolean> = {};
    const actionStarted: Record<string, ToolAction> = {};
    names.forEach(name => {
      updateStarted[name] = true;
      actionStarted[name] = 'update';
    });
    setUpdatingTools(prev => ({ ...prev, ...updateStarted }));
    setToolActions(prev => ({ ...prev, ...actionStarted }));

    try {
      await invoke('batch_update_tools', { names });
      await reloadToolsFromLocal(selectedTool?.name ?? null);
    } catch (error) {
      console.error('Failed to update all:', error);
      try {
        await reloadToolsFromLocal(selectedTool?.name ?? null);
      } catch (reloadError) {
        console.error('Failed to reload tools after batch update:', reloadError);
      }
      alert(`批量更新失败: ${error}`);
    } finally {
      const updateFinished: Record<string, boolean> = {};
      names.forEach(name => {
        updateFinished[name] = false;
      });
      setUpdatingTools(prev => ({ ...prev, ...updateFinished }));
      setToolActions((prev) => {
        const next = { ...prev };
        names.forEach(name => {
          delete next[name];
        });
        return next;
      });
    }
  };

  const updateableCount = tools.filter(
    (tool) => tool.update_available && tool.can_auto_update && !tool.ignored,
  ).length;

  const handleInstall = async (name: string) => {
    setUpdatingTools(prev => ({ ...prev, [name]: true }));
    setToolAction(name, 'install');
    try {
      const result = await invoke('install_tool', { name });
      console.log('Install result:', result);
      await reloadToolsFromLocal(name);
    } catch (error) {
      console.error('Failed to install:', error);
      alert(`安装失败: ${error}`);
    } finally {
      setUpdatingTools(prev => ({ ...prev, [name]: false }));
      setToolAction(name, null);
    }
  };

  const handleUninstall = async (name: string) => {
    const tool = tools.find((item) => item.name === name);
    const displayName = tool?.display_name ?? name;

    if (!window.confirm(`确定要卸载 ${displayName} 吗？卸载会移除该 CLI 工具。`)) {
      return;
    }

    setUpdatingTools(prev => ({ ...prev, [name]: true }));
    setToolAction(name, 'uninstall');
    try {
      const result = await invoke('uninstall_tool', { name });
      console.log('Uninstall result:', result);
      await reloadToolsFromLocal(name);
    } catch (error) {
      console.error('Failed to uninstall:', error);
      alert(`卸载失败: ${error}`);
    } finally {
      setUpdatingTools(prev => ({ ...prev, [name]: false }));
      setToolAction(name, null);
    }
  };

  const handleIgnore = async (name: string) => {
    try {
      await invoke('ignore_tool', { toolName: name });
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      await reloadToolsFromLocal(name);
    } catch (error) {
      console.error('Failed to ignore:', error);
    }
  };

  const handleUnignore = async (name: string) => {
    try {
      await invoke('unignore_tool', { toolName: name });
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      await reloadToolsFromLocal(selectedTool?.name ?? null);
    } catch (error) {
      console.error('Failed to unignore:', error);
    }
  };

  const handleClearIgnored = async () => {
    try {
      const ignored = [...config.ignored_tools];
      for (const tool of ignored) {
        await invoke('unignore_tool', { toolName: tool });
      }
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      await reloadToolsFromLocal(selectedTool?.name ?? null);
    } catch (error) {
      console.error('Failed to clear ignored:', error);
    }
  };

  const handleReorder = async (order: string[]) => {
    try {
      await invoke('save_tool_order', { order });
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      // 用快速检测刷新列表（不查网络版本）
      const quickData = await invoke<CliTool[]>('get_tools_quick');
      setTools(quickData);
    } catch (error) {
      console.error('Failed to save tool order:', error);
    }
  };

  const getEnvPath = async (name: string): Promise<string | null> => {
    try {
      const path = await invoke<string | null>('get_env_path', { name });
      return path;
    } catch (error) {
      console.error('Failed to get env path:', error);
      return null;
    }
  };

  const handleEnvClick = async (envName: string) => {
    if (!envCheck) return;

    const envMap: Record<string, { available: boolean; version: string | null; displayName: string; installCommand: string; updateCommand?: string }> = {
      node: {
        available: envCheck.node_available,
        version: envCheck.node_version,
        displayName: 'Node.js',
        installCommand: 'Visit nodejs.org',
        updateCommand: 'npm install -g node',
      },
      npm: {
        available: envCheck.npm_available,
        version: envCheck.npm_version,
        displayName: 'npm',
        installCommand: 'npm install -g npm',
        updateCommand: 'npm install -g npm',
      },
      cargo: {
        available: envCheck.cargo_available,
        version: envCheck.cargo_version,
        displayName: 'Cargo',
        installCommand: 'curl https://sh.rustup.rs -sSf | sh',
        updateCommand: 'rustup update',
      },
      rustc: {
        available: envCheck.rustc_available,
        version: envCheck.rustc_version,
        displayName: 'Rust',
        installCommand: 'curl https://sh.rustup.rs -sSf | sh',
        updateCommand: 'rustup update',
      },
    };

    const env = envMap[envName];
    if (!env) return;

    const path = await getEnvPath(envName);
    setSelectedEnv({
      name: envName,
      displayName: env.displayName,
      available: env.available,
      version: env.version,
      path: path,
      installCommand: env.installCommand,
      updateCommand: env.updateCommand,
    });
  };

  const handleEnvInstall = () => {
    // 这里可以添加实际的安装逻辑
    alert('自动安装功能开发中，请手动执行安装命令。');
  };

  const handleEnvUpdate = () => {
    // 这里可以添加实际的更新逻辑
    alert('自动更新功能开发中，请手动执行更新命令。');
  };

  return (
    <div className="app">
      <Header
        onCheckUpdates={handleCheckUpdates}
        onUpdateAll={handleUpdateAll}
        onRefresh={handleRefresh}
        onOpenSettings={() => setShowSettings(true)}
        onAddProvider={() => { setPreviousPage('home'); setShowProviderMgmt(true); }}
        isChecking={isChecking || isUpdating}
        updateableCount={updateableCount}
        envCheck={envCheck}
        onEnvClick={handleEnvClick}
      />
      
      <main className="app-main">
        {showProviderMgmt ? (
          <ProviderManagement
            onClose={() => {
              setShowProviderMgmt(false);
              if (previousPage === 'model-config') setShowModelConfig(true);
              if (previousPage === 'kimi-model-config') setShowKimiModelConfig(true);
              if (previousPage === 'opencode-model-config') setShowOpenCodeModelConfig(true);
              if (previousPage === 'codebuddy-model-config') setShowCodeBuddyModelConfig(true);
            }}
          />
        ) : showCodeBuddyModelConfig ? (
          <CodeBuddyModelConfig
            onClose={() => setShowCodeBuddyModelConfig(false)}
            onOpenProviderMgmt={() => { setPreviousPage('codebuddy-model-config'); setShowProviderMgmt(true); setShowCodeBuddyModelConfig(false); }}
          />
        ) : showOpenCodeModelConfig ? (
          <OpenCodeModelConfig
            onClose={() => setShowOpenCodeModelConfig(false)}
            onOpenProviderMgmt={() => { setPreviousPage('opencode-model-config'); setShowProviderMgmt(true); setShowOpenCodeModelConfig(false); }}
          />
        ) : showKimiModelConfig ? (
          <KimiModelConfig
            onClose={() => setShowKimiModelConfig(false)}
            onOpenProviderMgmt={() => { setPreviousPage('kimi-model-config'); setShowProviderMgmt(true); setShowKimiModelConfig(false); }}
          />
        ) : showModelConfig ? (
          <ModelConfig
            onClose={() => setShowModelConfig(false)}
            onOpenProviderMgmt={() => { setPreviousPage('model-config'); setShowProviderMgmt(true); setShowModelConfig(false); }}
          />
        ) : (
          <>
            <ToolList
              tools={tools}
              selectedTool={selectedTool}
              onSelectTool={setSelectedTool}
              onReorder={handleReorder}
              isChecking={isCheckingBackground}
            />
            <ToolDetail
              tool={selectedTool}
              onUpdate={handleUpdate}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onIgnore={handleIgnore}
              onOpenModelConfig={() => { setPreviousPage('home'); setShowModelConfig(true); }}
              onOpenKimiModelConfig={() => { setPreviousPage('home'); setShowKimiModelConfig(true); }}
              onOpenOpenCodeModelConfig={() => { setPreviousPage('home'); setShowOpenCodeModelConfig(true); }}
              onOpenCodeBuddyModelConfig={() => { setPreviousPage('home'); setShowCodeBuddyModelConfig(true); }}
              isUpdating={selectedTool ? !!updatingTools[selectedTool.name] : false}
              activeAction={selectedTool ? toolActions[selectedTool.name] ?? null : null}
            />
          </>
        )}
      </main>
      
      <StatusBar 
        lastCheckTime={config.last_check_time}
      />
      
      {showSettings && (
        <Settings
          config={config}
          onUnignore={handleUnignore}
          onClearIgnored={handleClearIgnored}
          onClose={() => setShowSettings(false)}
        />
      )}
      
      {selectedEnv && (
        <EnvDetail
          envInfo={selectedEnv}
          onClose={() => setSelectedEnv(null)}
          onInstall={handleEnvInstall}
          onUpdate={handleEnvUpdate}
          isInstalling={isInstalling}
          isUpdating={isEnvUpdating}
        />
      )}
    </div>
  );
}

export default App;
