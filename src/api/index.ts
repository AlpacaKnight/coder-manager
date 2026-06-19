import { invoke } from '@tauri-apps/api/core';
import type { CliTool, EnvCheck, AppConfig } from '../types';

export async function getEnvCheck(): Promise<EnvCheck> {
  return invoke('get_env_check');
}

export async function getInstalledTools(): Promise<CliTool[]> {
  return invoke('get_installed_tools');
}

export async function checkForUpdates(): Promise<CliTool[]> {
  return invoke('check_for_updates');
}

export async function updateTool(name: string): Promise<string> {
  return invoke('update_tool', { name });
}

export async function batchUpdateTools(names: string[]): Promise<string[]> {
  return invoke('batch_update_tools', { names });
}

export async function ignoreTool(name: string): Promise<void> {
  return invoke('ignore_tool', { toolName: name });
}

export async function unignoreTool(name: string): Promise<void> {
  return invoke('unignore_tool', { toolName: name });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke('get_config');
}

export async function refreshTools(): Promise<CliTool[]> {
  return invoke('refresh_tools');
}

export async function saveToolOrder(order: string[]): Promise<void> {
  return invoke('save_tool_order', { order });
}

export async function getToolsQuick(): Promise<CliTool[]> {
  return invoke('get_tools_quick');
}

export async function getToolUpdateCommand(name: string): Promise<string | null> {
  return invoke('get_tool_update_command', { name });
}
