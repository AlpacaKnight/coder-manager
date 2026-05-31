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

export interface AppConfig {
  ignored_tools: string[];
  last_check_time: string | null;
  tool_order: string[];
}
