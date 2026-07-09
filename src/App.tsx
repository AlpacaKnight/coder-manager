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

/** 归一化版本号：去除前缀 v/V、首尾空白，统一为纯版本字符串再比较，避免 v1.0.0 vs 1.0.0 误报 */
function normalizeVersion(version: string): string {
  return version.trim().replace(/^[vV]/, '');
}

function App() {
  const [tools, setTools] = useState<CliTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<CliTool | null>(null);
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [config, setConfig] = useState<AppConfig>({ ignored_tools: [], last_check_time: null, tool_order: [], providers: [] });
  const configRef = useRef(config);
  const networkCheckGenRef = useRef(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [showKimiModelConfig, setShowKimiModelConfig] = useState(false);
  const [showOpenCodeModelConfig, setShowOpenCodeModelConfig] = useState(false);
  const [showCodeBuddyModelConfig, setShowCodeBuddyModelConfig] = useState(false);
  const [showProviderMgmt, setShowProviderMgmt] = useState(false);
  const [previousPage, setPreviousPage] = useState<'home' | 'model-config' | 'kimi-model-config' | 'opencode-model-config' | 'codebuddy-model-config'>('home');
  const [providerMgmtReturnKey, setProviderMgmtReturnKey] = useState(0);
  const [updatingTools, setUpdatingTools] = useState<Record<string, boolean>>({});
  const [toolActions, setToolActions] = useState<Record<string, ToolAction>>({});
  const [selectedEnv, setSelectedEnv] = useState<EnvInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isEnvUpdating, setIsEnvUpdating] = useState(false);
  const [isCheckingBackground, setIsCheckingBackground] = useState(false);
  const [recheckingTools, setRecheckingTools] = useState<Record<string, boolean>>({});

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
    // 前端乐观更新 UI 显示的检查时间
    const nextConfig: AppConfig = {
      ...configRef.current,
      last_check_time: String(Math.floor(Date.now() / 1000)),
    };
    applyConfig(nextConfig);

    // 后端只更新 last_check_time 字段（加锁读最新配置再写），避免 save_config 整体覆盖丢失其他字段
    try {
      await invoke('update_last_check_time');
    } catch (error) {
      console.error('Failed to save last check time:', error);
    }
  }, [applyConfig]);

  // 封装：渐进式检查单个 CLI 工具的最新版本
  // gen 参数用于代际保护：若传入且已过期则不写回状态，避免旧请求覆盖新请求
  const checkSingleToolUpdate = useCallback(async (toolName: string, currentVersion: string, gen?: number) => {
    // 版本未知时无法判断更新，跳过（与后端 version_check 的 "未知" 跳过逻辑一致）
    if (currentVersion === '未知') return;
    try {
      const latest = await invoke<string | null>('get_tool_latest_version', { name: toolName });

      // 代际检查：若已过期则丢弃本次结果
      if (gen !== undefined && gen !== networkCheckGenRef.current) return;

      const hasLatest = latest !== null;
      const updateAvailable = hasLatest && normalizeVersion(latest) !== normalizeVersion(currentVersion);
      const computeStatus = (t: CliTool): ToolStatus => {
        if (t.ignored) return 'Ignored';
        if (currentVersion === '') return 'NotInstalled';
        if (hasLatest) return updateAvailable ? 'UpdateAvailable' : 'UpToDate';
        return t.can_auto_update ? 'Error' : 'ManualUpdate';
      };

      setTools((prevTools) =>
        prevTools.map((t) =>
          t.name === toolName
            ? { ...t, latest_version: latest, update_available: updateAvailable, status: computeStatus(t) }
            : t,
        ),
      );

      // 在事件处理函数中单独更新 selectedTool（不在 setTools updater 内，避免副作用）
      setSelectedTool((curr) => {
        if (!curr || curr.name !== toolName) return curr;
        return { ...curr, latest_version: latest, update_available: updateAvailable, status: computeStatus(curr) };
      });
    } catch (err) {
      console.error(`Failed to get version for ${toolName}:`, err);
      // 代际检查：若已过期则不写回错误状态
      if (gen !== undefined && gen !== networkCheckGenRef.current) return;
      // 检查失败退回先前本地估算出的版本状态
      setTools((prevTools) =>
        prevTools.map((t) => {
          if (t.name !== toolName) return t;
          const nextStatus: ToolStatus = t.current_version ? 'Error' : 'NotInstalled';
          return { ...t, status: nextStatus };
        }),
      );

      setSelectedTool((curr) => {
        if (!curr || curr.name !== toolName) return curr;
        const nextStatus: ToolStatus = curr.current_version ? 'Error' : 'NotInstalled';
        return { ...curr, status: nextStatus };
      });
    }
  }, []);

  // 批量并发检查版本
  const batchCheckUpdates = useCallback(async (toolsToCheck: CliTool[], gen?: number) => {
    for (let i = 0; i < toolsToCheck.length; i += VERSION_CHECK_CONCURRENCY) {
      const batch = toolsToCheck.slice(i, i + VERSION_CHECK_CONCURRENCY);
      await Promise.all(
        batch.map((tool) => checkSingleToolUpdate(tool.name, tool.current_version, gen)),
      );
    }
  }, [checkSingleToolUpdate]);

  // 触发所有已安装工具的网络最新版本查询（纯异步并发）
  const triggerNetworkChecks = useCallback(async (currentTools: CliTool[]) => {
    const gen = ++networkCheckGenRef.current;
    setIsCheckingBackground(true);
    const toolsToCheck = currentTools.filter(
      (tool) => !tool.ignored && tool.current_version && tool.current_version !== '未知',
    );

    setTools((prevTools) =>
      prevTools.map((tool) =>
        toolsToCheck.some((candidate) => candidate.name === tool.name)
          ? { ...tool, status: 'Checking' }
          : tool,
      ),
    );

    try {
      await batchCheckUpdates(toolsToCheck, gen);
      // 仅当本次检查仍为最新一代时才更新检查时间和关闭指示器，避免过期请求覆盖新请求
      if (gen !== networkCheckGenRef.current) return;
      await persistLastCheckTime();
    } finally {
      if (gen === networkCheckGenRef.current) {
        setIsCheckingBackground(false);
      }
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
    try {
      await triggerNetworkChecks(tools);
    } catch (error) {
      console.error('Failed to check updates:', error);
    }
  };

  const handleRecheck = async (name: string) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) return;

    setRecheckingTools((prev) => ({ ...prev, [name]: true }));
    try {
      if (tool.current_version && tool.current_version !== '未知') {
        // 已安装且版本已知的工具：检查最新版本
        await checkSingleToolUpdate(name, tool.current_version);
      } else {
        // 未安装或版本未知的工具：重新检测本地安装状态
        const quickData = await invoke<CliTool[]>('get_tools_quick');
        const updatedTool = quickData.find((t) => t.name === name);
        if (updatedTool) {
          // 只更新被重新检测的工具，保留其他工具的网络版本信息
          setTools((prev) => prev.map((t) => (t.name === name ? updatedTool : t)));
          setSelectedTool(updatedTool);
          // 如果检测到已安装，再检查最新版本
          if (updatedTool.current_version) {
            await checkSingleToolUpdate(name, updatedTool.current_version);
          }
        }
      }
      await persistLastCheckTime();
    } catch (error) {
      console.error('Failed to recheck:', error);
    } finally {
      setRecheckingTools((prev) => ({ ...prev, [name]: false }));
    }
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
    const ignored = [...config.ignored_tools];
    const results = await Promise.allSettled(
      ignored.map((tool) => invoke('unignore_tool', { toolName: tool })),
    );
    const failures = results
      .map((r, i) => (r.status === 'rejected' ? ignored[i] : null))
      .filter((t): t is string => t !== null);
    if (failures.length > 0) {
      alert(`以下工具取消忽略失败: ${failures.join(', ')}`);
    }
    try {
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      await reloadToolsFromLocal(selectedTool?.name ?? null);
    } catch (error) {
      console.error('Failed to reload after clearing ignored:', error);
    }
  };

  const handleReorder = async (order: string[]) => {
    try {
      await invoke('save_tool_order', { order });
      const configData = await invoke<AppConfig>('get_config');
      applyConfig(configData);
      // 仅按新顺序重排现有 tools，避免丢失已查到的网络版本信息
      const orderMap = new Map(order.map((name, idx) => [name, idx]));
      setTools((prev) =>
        [...prev].sort((a, b) => {
          const idxA = orderMap.get(a.name) ?? Number.MAX_SAFE_INTEGER;
          const idxB = orderMap.get(b.name) ?? Number.MAX_SAFE_INTEGER;
          return idxA - idxB;
        }),
      );
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

  const handleEnvInstall = async () => {
    setIsInstalling(true);
    try {
      // 这里可以添加实际的安装逻辑
      alert('自动安装功能开发中，请手动执行安装命令。');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleEnvUpdate = async () => {
    setIsEnvUpdating(true);
    try {
      // 这里可以添加实际的更新逻辑
      alert('自动更新功能开发中，请手动执行更新命令。');
    } finally {
      setIsEnvUpdating(false);
    }
  };

  return (
    <div className="app">
      <Header
        onCheckUpdates={handleCheckUpdates}
        onUpdateAll={handleUpdateAll}
        onRefresh={handleRefresh}
        onOpenSettings={() => setShowSettings(true)}
        onAddProvider={() => { setPreviousPage('home'); setShowProviderMgmt(true); }}
        isChecking={isCheckingBackground || isUpdating}
        updateableCount={updateableCount}
        envCheck={envCheck}
        onEnvClick={handleEnvClick}
      />
      
      <main className="app-main">
        {showProviderMgmt ? (
          <ProviderManagement
            onClose={() => {
              setShowProviderMgmt(false);
              setProviderMgmtReturnKey((k) => k + 1);
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
            key={`opencode-${providerMgmtReturnKey}`}
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
              onRecheck={handleRecheck}
              onOpenModelConfig={() => { setPreviousPage('home'); setShowModelConfig(true); }}
              onOpenKimiModelConfig={() => { setPreviousPage('home'); setShowKimiModelConfig(true); }}
              onOpenOpenCodeModelConfig={() => { setPreviousPage('home'); setShowOpenCodeModelConfig(true); }}
              onOpenCodeBuddyModelConfig={() => { setPreviousPage('home'); setShowCodeBuddyModelConfig(true); }}
              isUpdating={selectedTool ? !!updatingTools[selectedTool.name] : false}
              isRechecking={selectedTool ? !!recheckingTools[selectedTool.name] : false}
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
