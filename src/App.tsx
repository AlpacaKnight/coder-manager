import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ToolList } from './components/ToolList';
import { ToolDetail } from './components/ToolDetail';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { Settings } from './pages/Settings';
import { EnvDetail } from './components/EnvDetail';
import type { CliTool, EnvCheck, AppConfig } from './types';
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

function App() {
  const [tools, setTools] = useState<CliTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<CliTool | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [config, setConfig] = useState<AppConfig>({ ignored_tools: [], last_check_time: null, tool_order: [] });
  const [showSettings, setShowSettings] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [updatingTools, setUpdatingTools] = useState<Record<string, boolean>>({});
  const [selectedEnv, setSelectedEnv] = useState<EnvInfo | null>(null);
  const [isInstalling] = useState(false);
  const [isEnvUpdating] = useState(false);
  const [isCheckingBackground, setIsCheckingBackground] = useState(false);

  // 计算全局是否在更新（供 Header 使用避免冲突）
  const isUpdating = Object.values(updatingTools).some(Boolean);

  // 封装：渐进式检查单个 CLI 工具的最新版本
  const checkSingleToolUpdate = useCallback(async (toolName: string, currentVersion: string) => {
    try {
      const latest = await invoke<string | null>('get_tool_latest_version', { name: toolName });
      
      setTools((prevTools) =>
        prevTools.map((t) => {
          if (t.name === toolName) {
            const hasLatest = latest !== null;
            const updateAvailable = hasLatest && latest !== currentVersion;
            let nextStatus = t.status;
            if (t.ignored) {
              nextStatus = 'Ignored';
            } else if (currentVersion === '') {
              nextStatus = 'NotInstalled';
            } else if (hasLatest) {
              nextStatus = updateAvailable ? 'UpdateAvailable' : 'UpToDate';
            } else {
              // 无法获取最新版本，显示为 UpToDate
              nextStatus = 'UpToDate';
            }

            const updatedTool: CliTool = {
              ...t,
              latest_version: latest,
              update_available: updateAvailable,
              status: nextStatus as any,
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
            const nextStatus = t.current_version ? 'UpToDate' as any : 'NotInstalled' as any;
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

  // 触发所有已安装工具的网络最新版本查询（纯异步并发）
  const triggerNetworkChecks = useCallback(async (currentTools: CliTool[]) => {
    setIsCheckingBackground(true);
    
    const checkPromises = currentTools.map(async (tool) => {
      // 只有已安装、未忽略的最简工具才去查
      if (tool.ignored || !tool.current_version) {
        return;
      }
      
      // 在状态中把它标志为 Checking，开始炫酷的加载动画
      setTools((prevTools) =>
        prevTools.map((t) => (t.name === tool.name ? { ...t, status: 'Checking' as any } : t))
      );

      await checkSingleToolUpdate(tool.name, tool.current_version);
    });

    await Promise.all(checkPromises);
    setIsCheckingBackground(false);
  }, [checkSingleToolUpdate]);

  const loadInitialData = useCallback(async () => {
    try {
      // Phase 1: 真正毫秒级秒开 — 仅获取工具名称和排序，读取配置
      const [namesTools, configData] = await Promise.all([
        invoke<CliTool[]>('get_tool_names'),
        invoke<AppConfig>('get_config'),
      ]);
      setTools(namesTools);
      setConfig(configData);

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
  }, [triggerNetworkChecks]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadInitialData();
    });
  }, [loadInitialData]);

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    try {
      // 1. 先展示 Checking 在前端
      setTools((prevTools) =>
        prevTools.map((t) => {
          if (!t.ignored && t.current_version) {
            return { ...t, status: 'Checking' as any };
          }
          return t;
        })
      );

      // 2. 并发针对各工具发送后台各自的 API 请求
      const checkPromises = tools.map(async (tool) => {
        if (tool.ignored || !tool.current_version) {
          return;
        }
        await checkSingleToolUpdate(tool.name, tool.current_version);
      });

      await Promise.all(checkPromises);

      // 更新最后检查时间属性
      const configData = await invoke<AppConfig>('get_config');
      setConfig(configData);
    } catch (error) {
      console.error('Failed to check updates:', error);
    }
    setIsChecking(false);
  };

  const handleRefresh = async () => {
    try {
      const toolsData = await invoke<CliTool[]>('get_tools_quick');
      setTools(toolsData);
      setSelectedTool(null);
      // 刷新也自动激活后台最新版本检查
      await triggerNetworkChecks(toolsData);
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  };

  const handleUpdate = async (name: string) => {
    setUpdatingTools(prev => ({ ...prev, [name]: true }));
    try {
      await invoke('update_tool', { name });
      await handleCheckUpdates();
    } catch (error) {
      console.error('Failed to update:', error);
      alert(`更新失败: ${error}`);
    } finally {
      setUpdatingTools(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleUpdateAll = async () => {
    const names = tools
      .filter((tool) => tool.update_available && tool.can_auto_update && !tool.ignored)
      .map((tool) => tool.name);

    if (names.length === 0) return;

    // 将所有这些工具标记为更新中
    const updateStarted: Record<string, boolean> = {};
    names.forEach(name => {
      updateStarted[name] = true;
    });
    setUpdatingTools(prev => ({ ...prev, ...updateStarted }));

    try {
      await invoke('batch_update_tools', { names });
      await handleCheckUpdates();
    } catch (error) {
      console.error('Failed to update all:', error);
      alert(`批量更新失败: ${error}`);
    } finally {
      const updateFinished: Record<string, boolean> = {};
      names.forEach(name => {
        updateFinished[name] = false;
      });
      setUpdatingTools(prev => ({ ...prev, ...updateFinished }));
    }
  };

  const updateableCount = tools.filter(
    (tool) => tool.update_available && tool.can_auto_update && !tool.ignored,
  ).length;

  const handleInstall = async (name: string) => {
    setUpdatingTools(prev => ({ ...prev, [name]: true }));
    try {
      const result = await invoke('install_tool', { name });
      console.log('Install result:', result);
      await handleCheckUpdates();
    } catch (error) {
      console.error('Failed to install:', error);
      alert(`安装失败: ${error}`);
    } finally {
      setUpdatingTools(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleIgnore = async (name: string) => {
    try {
      await invoke('ignore_tool', { toolName: name });
      const configData = await invoke<AppConfig>('get_config');
      setConfig(configData);
      const toolsData = await invoke<CliTool[]>('refresh_tools');
      setTools(toolsData);
    } catch (error) {
      console.error('Failed to ignore:', error);
    }
  };

  const handleUnignore = async (name: string) => {
    try {
      await invoke('unignore_tool', { toolName: name });
      const configData = await invoke<AppConfig>('get_config');
      setConfig(configData);
      const toolsData = await invoke<CliTool[]>('refresh_tools');
      setTools(toolsData);
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
      setConfig(configData);
      const toolsData = await invoke<CliTool[]>('refresh_tools');
      setTools(toolsData);
    } catch (error) {
      console.error('Failed to clear ignored:', error);
    }
  };

  const handleReorder = async (order: string[]) => {
    try {
      await invoke('save_tool_order', { order });
      const configData = await invoke<AppConfig>('get_config');
      setConfig(configData);
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
        isChecking={isChecking || isUpdating}
        updateableCount={updateableCount}
        envCheck={envCheck}
        onEnvClick={handleEnvClick}
      />
      
      <main className="app-main">
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
          onIgnore={handleIgnore}
          isUpdating={selectedTool ? !!updatingTools[selectedTool.name] : false}
        />
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
