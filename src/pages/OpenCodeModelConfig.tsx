import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  Provider,
  OpenCodeSettings,
  OpenCodeProviderConfig,
  OpenCodeProviderDisplay,
} from '../types';

interface OpenCodeModelConfigProps {
  onClose: () => void;
  onOpenProviderMgmt: () => void;
}

const NPM_TO_LABEL: Record<string, string> = {
  '@ai-sdk/openai': 'OpenAI',
  '@ai-sdk/anthropic': 'Anthropic',
  '@ai-sdk/google': 'Gemini',
  '@ai-sdk/openai-compatible': 'OpenAI Compatible',
};

function npmToProviderType(npm?: string): string {
  if (!npm) return 'openai';
  if (npm.includes('anthropic')) return 'anthropic';
  if (npm.includes('google')) return 'gemini';
  return 'openai';
}

function providerTypeToNpm(type: string): string {
  switch (type) {
    case 'anthropic': return '@ai-sdk/anthropic';
    case 'gemini': return '@ai-sdk/google';
    default: return '@ai-sdk/openai';
  }
}

export function OpenCodeModelConfig({ onClose, onOpenProviderMgmt }: OpenCodeModelConfigProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [opencodeSettings, setOpencodeSettings] = useState<OpenCodeSettings>({ provider: {} });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());
  const [dropdownValue, setDropdownValue] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [providerData, settings] = await Promise.all([
        invoke<Provider[]>('get_providers'),
        invoke<OpenCodeSettings>('load_opencode_settings'),
      ]);
      setProviders(providerData);
      setOpencodeSettings(settings);

      const keys = new Set<string>();
      for (const [providerKey, p] of Object.entries(settings.provider)) {
        // 按模型展开：一个 provider 下的每个模型都是独立勾选项
        if (p.models && Object.keys(p.models).length > 0) {
          for (const modelId of Object.keys(p.models)) {
            keys.add(`existing:${providerKey}::${modelId}`);
          }
        } else {
          // 没有 models 的 provider 保留为整组勾选项
          keys.add(`existing:${providerKey}`);
        }
      }
      setSelectedKeys(keys);
      setDropdownAddedKeys(new Set());
    } catch (err) {
      console.error('Failed to load data:', err);
      setOpencodeSettings({ provider: {} });
      setSelectedKeys(new Set());
      setDropdownAddedKeys(new Set());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await loadData();
      if (cancelled) return;
      setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [loadData]);

  const dropdownOptions = useMemo(() => {
    return providers.filter((p) => {
      const key = `provider:${p.id}`;
      if (dropdownAddedKeys.has(key)) return false;
      return true;
    });
  }, [providers, dropdownAddedKeys]);

  // 统一展示列表：existing 按模型展开，provider 为整组
  const providerList = useMemo((): OpenCodeProviderDisplay[] => {
    const result: OpenCodeProviderDisplay[] = [];

    for (const [providerKey, p] of Object.entries(opencodeSettings.provider)) {
      const providerType = npmToProviderType(p.npm);
      const hasApiKey = Boolean(p.options?.apiKey);
      if (p.models && Object.keys(p.models).length > 0) {
        for (const modelId of Object.keys(p.models)) {
          result.push({
            key: `existing:${providerKey}::${modelId}`,
            provider_id: providerKey,
            provider_type: providerType,
            has_api_key: hasApiKey,
            source: 'existing',
            model_id: modelId,
          });
        }
      } else {
        result.push({
          key: `existing:${providerKey}`,
          provider_id: providerKey,
          provider_type: providerType,
          has_api_key: hasApiKey,
          source: 'existing',
        });
      }
    }

    for (const key of dropdownAddedKeys) {
      const pid = key.replace('provider:', '');
      const p = providers.find((pr) => pr.id === pid);
      if (!p) continue;
      result.push({
        key,
        provider_id: p.id,
        provider_type: p.provider_type,
        has_api_key: Boolean(p.api_key),
        source: 'provider',
      });
    }

    return result;
  }, [providers, opencodeSettings, dropdownAddedKeys]);

  // 按 provider 分组
  const groupedProviderList = useMemo(() => {
    const groups: {
      groupKey: string;
      groupTitle: string;
      providerType: string;
      items: OpenCodeProviderDisplay[];
    }[] = [];

    const providerGroups = new Map<string, OpenCodeProviderDisplay[]>();
    for (const item of providerList) {
      if (item.source !== 'existing') continue;
      if (!providerGroups.has(item.provider_id)) {
        providerGroups.set(item.provider_id, []);
      }
      providerGroups.get(item.provider_id)!.push(item);
    }

    for (const [providerId, items] of providerGroups) {
      const providerConfig = opencodeSettings.provider[providerId];
      const npm = providerConfig?.npm;
      groups.push({
        groupKey: `existing:${providerId}`,
        groupTitle: providerId,
        providerType: npmToProviderType(npm),
        items,
      });
    }

    const newItems = providerList.filter((item) => item.source === 'provider');
    for (const item of newItems) {
      groups.push({
        groupKey: `provider:${item.provider_id}`,
        groupTitle: item.provider_id,
        providerType: item.provider_type,
        items: [item],
      });
    }

    return groups;
  }, [providerList, opencodeSettings]);

  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleGroupSelect = (groupKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const group = groupedProviderList.find((g) => g.groupKey === groupKey);
      if (!group) return next;

      const allSelected = group.items.every((item) => next.has(item.key));
      for (const item of group.items) {
        if (allSelected) {
          next.delete(item.key);
        } else {
          next.add(item.key);
        }
      }
      return next;
    });
  };

  // 预览：按选中集合重建 provider 配置
  const preview = useMemo(() => {
    const config: Record<string, unknown> = {};
    const providerConfig: Record<string, unknown> = {};

    // existing：按 provider 聚合，每个 provider 重建只含勾选模型的 models map
    const groupedExisting = new Map<string, OpenCodeProviderDisplay[]>();
    for (const item of providerList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source !== 'existing') continue;
      if (!groupedExisting.has(item.provider_id)) {
        groupedExisting.set(item.provider_id, []);
      }
      groupedExisting.get(item.provider_id)!.push(item);
    }

    for (const [providerId, items] of groupedExisting) {
      const p = opencodeSettings.provider[providerId];
      if (!p) continue;
      const hasModelItems = items.some((i) => i.model_id !== undefined);
      if (hasModelItems) {
        // 模型级：重建 models map，只含勾选模型
        const models: Record<string, unknown> = {};
        for (const item of items) {
          if (item.model_id && p.models) {
            models[item.model_id] = p.models[item.model_id];
          }
        }
        providerConfig[providerId] = {
          npm: p.npm,
          ...(p.options && { options: p.options }),
          ...(Object.keys(models).length > 0 && { models }),
        };
      } else {
        // 无模型 provider：整体保留
        providerConfig[providerId] = {
          npm: p.npm,
          ...(p.options && { options: p.options }),
          ...(p.models && Object.keys(p.models).length > 0 && { models: p.models }),
        };
      }
    }

    // 新增 provider（整组）
    for (const item of providerList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source !== 'provider') continue;
      const p = providers.find((pr) => pr.id === item.provider_id);
      if (p) {
        const npm = providerTypeToNpm(p.provider_type);
        const models: Record<string, unknown> = {};
        for (const m of p.models) {
          models[m.id] = { name: m.name };
        }
        providerConfig[item.provider_id] = {
          npm,
          options: {
            apiKey: p.api_key,
          },
          ...(Object.keys(models).length > 0 && { models }),
        };
      }
    }

    config.provider = providerConfig;
    return JSON.stringify(config, null, 2);
  }, [selectedKeys, providerList, opencodeSettings, providers]);

  const handleDropdownAdd = () => {
    if (!dropdownValue) return;
    const key = `provider:${dropdownValue}`;
    setDropdownAddedKeys((prev) => new Set(prev).add(key));
    setSelectedKeys((prev) => new Set(prev).add(key));
    setDropdownValue('');
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleOpenSettingsFile = async () => {
    try {
      await invoke('open_opencode_settings_file');
    } catch (err) {
      alert(`打开失败: ${err}`);
    }
  };

  const handleRegister = async () => {
    // 按 provider 聚合选中的 existing 项，重建每个 provider 的配置（含精简后的 models map）
    const groupedExisting = new Map<string, OpenCodeProviderDisplay[]>();
    for (const item of providerList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source !== 'existing') continue;
      if (!groupedExisting.has(item.provider_id)) {
        groupedExisting.set(item.provider_id, []);
      }
      groupedExisting.get(item.provider_id)!.push(item);
    }

    const keptProviders: Record<string, OpenCodeProviderConfig> = {};
    for (const [providerId, items] of groupedExisting) {
      const p = opencodeSettings.provider[providerId];
      if (!p) continue;
      const hasModelItems = items.some((i) => i.model_id !== undefined);
      if (hasModelItems) {
        const models: Record<string, unknown> = {};
        for (const item of items) {
          if (item.model_id && p.models) {
            models[item.model_id] = p.models[item.model_id];
          }
        }
        keptProviders[providerId] = {
          npm: p.npm,
          ...(p.options && { options: p.options }),
          ...(Object.keys(models).length > 0 && { models }),
        };
      } else {
        keptProviders[providerId] = {
          npm: p.npm,
          ...(p.options && { options: p.options }),
          ...(p.models && Object.keys(p.models).length > 0 && { models: p.models }),
        };
      }
    }

    const newProviderIds: string[] = [];
    for (const item of providerList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source === 'provider') {
        newProviderIds.push(item.provider_id);
      }
    }

    setRegistering(true);
    try {
      const result = await invoke<OpenCodeSettings>('apply_opencode_model_config', {
        keptProviders,
        providerIds: newProviderIds,
      });
      setOpencodeSettings(result);
      await loadData();
      alert('配置已更新！');
    } catch (err) {
      alert(`配置失败: ${err}`);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="model-config-page">
        <div className="model-config-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="model-config-page">
      <div className="model-config-header">
        <button className="btn-back" onClick={onClose} title="取消并返回">←</button>
        <h2>配置 OpenCode 模型</h2>
      </div>

      <div className="model-config-body">
        <div className="model-config-left">
          <div className="model-config-section">
            <div className="provider-add-row">
              <select
                className="model-config-input model-config-select"
                value={dropdownValue}
                onChange={(e) => setDropdownValue(e.target.value)}
              >
                <option value="">-- 从 Provider 添加 --</option>
                {dropdownOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="btn-add-provider"
                onClick={handleDropdownAdd}
                disabled={!dropdownValue}
              >
                添加
              </button>
              <button
                className="btn-link-action"
                onClick={onOpenProviderMgmt}
                title="管理 Provider"
              >
                + 新建 Provider
              </button>
            </div>

            <h3 className="model-config-section-title">
              Provider 列表
              <span className="model-config-hint">（已注册默认勾选，取消勾选将移除）</span>
            </h3>

            {providerList.length === 0 ? (
              <p className="empty-message">暂无可用 Provider，请先通过上方下拉菜单添加或前往「新建 Provider」创建。</p>
            ) : (
              <div className="provider-select-list">
                {groupedProviderList.map((group) => {
                  const isExpanded = expandedGroups.has(group.groupKey);
                  const selectedCount = group.items.filter((item) =>
                    selectedKeys.has(item.key),
                  ).length;
                  const allSelected = group.items.every((item) => selectedKeys.has(item.key));

                  return (
                    <div key={group.groupKey} className="provider-group">
                      <div
                        className="provider-group-header"
                        onClick={() => toggleGroupExpand(group.groupKey)}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleGroupSelect(group.groupKey)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="provider-group-toggle">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span className="provider-group-title">{group.groupTitle}</span>
                        <span className="provider-group-count">
                          {selectedCount}/{group.items.length}
                        </span>
                        <span className={`provider-protocol-tag protocol-${group.providerType}`}>
                          {NPM_TO_LABEL[providerTypeToNpm(group.providerType)] || group.providerType}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="provider-group-models">
                          {group.items.map((item) => (
                            <label
                              key={item.key}
                              className="provider-select-item"
                            >
                              <input
                                type="checkbox"
                                checked={selectedKeys.has(item.key)}
                                onChange={() => toggleSelect(item.key)}
                              />
                              <div className="provider-select-info">
                                <span className="provider-select-name">
                                  {item.model_id || item.provider_id}
                                </span>
                                <span className="provider-select-model">
                                  {item.has_api_key ? 'API Key 已配置' : '未配置 API Key'}
                                </span>
                              </div>
                              {item.source === 'existing' && (
                                <span className="provider-source-badge">
                                  已注册
                                </span>
                              )}
                              {item.source === 'provider' && (
                                <span className="provider-source-badge provider-source-new">
                                  新增
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="model-config-right">
          <div className="model-config-section-title-row">
            <h3 className="model-config-section-title">
              OpenCode 配置预览
            </h3>
            <button
              className="btn-link-action"
              onClick={handleOpenSettingsFile}
              title="用系统默认编辑器打开 ~/.config/opencode/opencode.json"
            >
              打开配置文件
            </button>
          </div>
          <pre className="settings-preview">{preview}</pre>
        </div>
      </div>

      <div className="model-config-actions">
        <div className="model-config-actions-spacer" />
        <button
          className="btn-primary"
          onClick={handleRegister}
          disabled={registering || selectedKeys.size === 0}
        >
          {registering ? '应用中...' : '应用配置'}
        </button>
      </div>
    </div>
  );
}
