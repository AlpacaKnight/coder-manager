export interface CliTool {
  name: string;
  display_name: string;
  current_version: string;
  latest_version: string | null;
  path: string | null;
  update_available: boolean;
  can_auto_update: boolean;
  install_command: string;
  update_command: string | null;
  ignored: boolean;
  status: ToolStatus;
}

export type ToolStatus =
  | 'UpToDate'
  | 'UpdateAvailable'
  | 'ManualUpdate'
  | 'NotInstalled'
  | 'Ignored'
  | 'Error'
  | 'Checking';

export interface EnvCheck {
  node_available: boolean;
  npm_available: boolean;
  cargo_available: boolean;
  rustc_available: boolean;
  node_version: string | null;
  npm_version: string | null;
  cargo_version: string | null;
  rustc_version: string | null;
}

export type ProviderType = 'openai' | 'openai-responses' | 'anthropic';

export interface ModelEntry {
  id: string;
  name: string;
}

export interface Provider {
  id: string;
  name: string;
  api_base_url: string;
  api_key: string;
  provider_type: ProviderType;
  models: ModelEntry[];
  model_name?: string;
}

export interface AppConfig {
  ignored_tools: string[];
  last_check_time: string | null;
  tool_order: string[];
  providers: Provider[];
}

export interface QwenModel {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;
  providerType?: string;
}

export interface ModelDisplay {
  key: string;
  model_name: string;
  display_name: string;
  protocol: 'openai' | 'anthropic';
  source: 'existing' | 'provider';
  provider_id?: string;
  index?: number;
}

export interface KimiModel {
  provider: string;
  model: string;
  max_context_size: number;
  max_output_size?: number;
  display_name?: string;
  capabilities?: string[];
}

export interface KimiSettings {
  default_model?: string;
  providers: Record<string, KimiProviderConfig>;
  models: Record<string, KimiModel>;
}

export interface KimiProviderConfig {
  type: string;
  base_url?: string;
  api_key?: string;
  env?: Record<string, string>;
}

export interface KimiModelDisplay {
  key: string;
  model_id: string;
  display_name: string;
  provider: string;
  provider_type: string;
  source: 'existing' | 'provider';
  provider_id?: string;
}
