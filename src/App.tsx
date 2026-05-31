import { useState, useEffect } from 'react';
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<EnvInfo | null>(null);
  const [isInstalling] = useState(false);
  const [isEnvUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingBackground, setIsCheckingBackground] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Phase 1: 秒开骨架 — 仅获取工具名称和排序，不检测系统
      const [namesTools, envData, configData] = await Promise.all([
        invoke<CliTool[]>('get_tool_names'),
        invoke<EnvCheck>('get_env_check'),
        invoke<AppConfig>('get_config'),
      ]);
      setTools(namesTools);
      setEnvCheck(envData);
      setConfig(configData);
      setIsLoading(false);

      // Phase 2: 后台检测本地工具版本
      setIsCheckingBackground(true);
      try {
        const quickTools = await invoke<CliTool[]>('get_tools_quick');
        setTools(quickTools);
      } catch (err) {
        console.error('Quick detection failed:', err);
      }

      // Phase 3: 后台查网络最新版本
      try {
        const updatedTools = await invoke<CliTool[]>('check_for_updates');
        setTools(updatedTools);
      } catch (err) {
        console.error('Background version check failed:', err);
      }
      setIsCheckingBackground(false);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setIsLoading(false);
    }
  };

  const handleCheckUpdates = async () => {
    setIsChecking(true);
    try {
      const updatedTools = await invoke<CliTool[]>('check_for_updates');
      setTools(updatedTools);
      const configData = await invoke<AppConfig>('get_config');
      setConfig(configData);
    } catch (error) {
      console.error('Failed to check updates:', error);
    }
    setIsChecking(false);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const toolsData = await invoke<CliTool[]>('get_tools_quick');
      setTools(toolsData);
      setSelectedTool(null);
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
    setIsLoading(false);
  };

  const handleUpdate = async (name: string) => {
    setIsUpdating(true);
    try {
      await invoke('update_tool', { name });
      await handleCheckUpdates();
    } catch (error) {
      console.error('Failed to update:', error);
      alert(`更新失败: ${error}`);
    }
    setIsUpdating(false);
  };

  const handleInstall = async (name: string) => {
    setIsUpdating(true);
    try {
      const result = await invoke('install_tool', { name });
      console.log('Install result:', result);
      await handleCheckUpdates();
    } catch (error) {
      console.error('Failed to install:', error);
      alert(`安装失败: ${error}`);
    }
    setIsUpdating(false);
  };

  const handleIgnore = async (name: string) => {
    try {
      await invoke('ignore_tool', { name });
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
      await invoke('unignore_tool', { name });
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
        await invoke('unignore_tool', { tool });
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

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>正在检测系统工具...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header 
        onCheckUpdates={handleCheckUpdates}
        onRefresh={handleRefresh}
        onOpenSettings={() => setShowSettings(true)}
        isChecking={isChecking}
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
          isUpdating={isUpdating}
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
