import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, KimiModel, KimiSettings, KimiModelDisplay } from '../types';

interface KimiModelConfigProps {
  onClose: () => void;
  onOpenProviderMgmt: () => void;
}

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  kimi: 'Kimi',
  openai: 'OpenAI',
  'openai-responses': 'OpenAI Responses',
  anthropic: 'Anthropic',
  'google-genai': 'Google GenAI',
  vertexai: 'Vertex AI',
};

export function KimiModelConfig({ onClose, onOpenProviderMgmt }: KimiModelConfigProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [kimiSettings, setKimiSettings] = useState<KimiSettings>({ providers: {}, models: {} });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());
  const [dropdownValue, setDropdownValue] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contextSizeOverrides, setContextSizeOverrides] = useState<Record<string, number>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const [providerData, settings] = await Promise.all([
        invoke<Provider[]>('get_providers'),
        invoke<KimiSettings>('load_kimi_settings'),
      ]);
      setProviders(providerData);
      setKimiSettings(settings);

      const keys = new Set<string>();
      for (const key of Object.keys(settings.models)) {
        keys.add(`existing:${key}`);
      }
      setSelectedKeys(keys);
      setDropdownAddedKeys(new Set());
      setContextSizeOverrides({});
    } catch (err) {
      console.error('Failed to load data:', err);
      setKimiSettings({ providers: {}, models: {} });
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

  const modelList = useMemo((): KimiModelDisplay[] => {
    const result: KimiModelDisplay[] = [];

    for (const [key, m] of Object.entries(kimiSettings.models)) {
      const providerConfig = kimiSettings.providers[m.provider];
      result.push({
        key: `existing:${key}`,
        model_id: m.model,
        display_name: m.display_name || m.model,
        provider: m.provider,
        provider_type: providerConfig?.type || 'unknown',
        source: 'existing',
      });
    }

    for (const key of dropdownAddedKeys) {
      const pid = key.replace('provider:', '');
      const p = providers.find((pr) => pr.id === pid);
      if (!p) continue;
      result.push({
        key,
        model_id: p.models.map((m) => m.id).join(', ') || '',
        display_name: p.name,
        provider: `managed:${p.id}`,
        provider_type: p.provider_type,
        source: 'provider',
        provider_id: p.id,
      });
    }

    return result;
  }, [providers, kimiSettings, dropdownAddedKeys]);

  const groupedModelList = useMemo(() => {
    const groups: {
      groupKey: string;
      groupTitle: string;
      providerType: string;
      items: KimiModelDisplay[];
    }[] = [];

    const existingItems = modelList.filter((item) => item.source === 'existing');
    const providerGroups = new Map<string, KimiModelDisplay[]>();
    for (const item of existingItems) {
      const groupKey = item.provider;
      if (!providerGroups.has(groupKey)) {
        providerGroups.set(groupKey, []);
      }
      providerGroups.get(groupKey)!.push(item);
    }

    for (const [provider, items] of providerGroups) {
      const providerConfig = kimiSettings.providers[provider];
      groups.push({
        groupKey: `existing:${provider}`,
        groupTitle: provider,
        providerType: providerConfig?.type || 'unknown',
        items,
      });
    }

    const providerItems = modelList.filter((item) => item.source === 'provider');
    for (const item of providerItems) {
      if (!item.provider_id) continue;
      groups.push({
        groupKey: `provider:${item.provider_id}`,
        groupTitle: item.display_name,
        providerType: item.provider_type,
        items: [item],
      });
    }

    return groups;
  }, [modelList, kimiSettings]);

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
      const group = groupedModelList.find((g) => g.groupKey === groupKey);
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

  const preview = useMemo(() => {
    const selectedModels: { model: KimiModel; modelKey: string }[] = [];
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const modelKey = item.key.replace('existing:', '');
        const m = kimiSettings.models[modelKey];
        if (m) selectedModels.push({ model: m, modelKey });
      } else if (item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    const config: Record<string, unknown> = {};

    if (kimiSettings.default_model) {
      config.default_model = kimiSettings.default_model;
    }

    const providersConfig: Record<string, unknown> = {};
    for (const [key, p] of Object.entries(kimiSettings.providers)) {
      providersConfig[key] = {
        type: p.type,
        ...(p.base_url && { base_url: p.base_url }),
        ...(p.api_key && { api_key: p.api_key }),
      };
    }

    for (const pid of newProviderIds) {
      const p = providers.find((pr) => pr.id === pid);
      if (p) {
        const providerType = p.provider_type === 'anthropic' ? 'anthropic' : p.provider_type === 'openai-responses' ? 'openai_responses' : 'openai';
        providersConfig[`managed:${p.id}`] = {
          type: providerType,
          base_url: p.api_base_url,
          api_key: p.api_key,
        };
      }
    }
    config.providers = providersConfig;

    const modelsConfig: Record<string, unknown> = {};
    for (const { model: m, modelKey } of selectedModels) {
      const contextSize = contextSizeOverrides[modelKey] || m.max_context_size;
      modelsConfig[m.model] = {
        provider: m.provider,
        model: m.model,
        max_context_size: contextSize,
        ...(m.display_name && { display_name: m.display_name }),
      };
    }

    for (const pid of newProviderIds) {
      const p = providers.find((pr) => pr.id === pid);
      if (p) {
        const providerOverrideKey = `provider:${pid}`;
        for (const m of p.models) {
          const contextSize = contextSizeOverrides[providerOverrideKey] || 128000;
          modelsConfig[m.id] = {
            provider: `managed:${p.id}`,
            model: m.id,
            max_context_size: contextSize,
            display_name: m.name,
          };
        }
      }
    }
    config.models = modelsConfig;

    return JSON.stringify(config, null, 2);
  }, [selectedKeys, modelList, kimiSettings, providers, contextSizeOverrides]);

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
      await invoke('open_kimi_settings_file');
    } catch (err) {
      alert(`打开失败: ${err}`);
    }
  };

  const handleRegister = async () => {
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source === 'provider' && item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    const keepModels: KimiModel[] = [];
    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;
      if (item.source === 'existing') {
        const modelKey = item.key.replace('existing:', '');
        const m = kimiSettings.models[modelKey];
        if (m) {
          // 应用用户修改的上下文窗口大小（避免只改了预览没落盘）
          const override = contextSizeOverrides[modelKey];
          keepModels.push(override !== undefined ? { ...m, max_context_size: override } : m);
        }
      } else if (item.source === 'provider' && item.provider_id) {
        // 为 Provider 模型也构造 KimiModel，应用用户修改的上下文窗口大小
        const providerOverrideKey = `provider:${item.provider_id}`;
        const contextSize = contextSizeOverrides[providerOverrideKey] || 128000;
        const p = providers.find((pr) => pr.id === item.provider_id);
        if (p) {
          for (const m of p.models) {
            keepModels.push({
              provider: `managed:${p.id}`,
              model: m.id,
              max_context_size: contextSize,
              display_name: m.name,
            });
          }
        }
      }
    }

    setRegistering(true);
    try {
      const result = await invoke<KimiSettings>('apply_kimi_model_config', {
        customModels: keepModels,
        providerIds: newProviderIds,
      });
      setKimiSettings(result);
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
        <h2>配置 Kimi Code 模型</h2>
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
                <option value="">-- 从 Provider 添加模型 --</option>
                {dropdownOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.models.length} 个模型)
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
              模型列表
              <span className="model-config-hint">（已注册默认勾选，取消勾选将移除）</span>
            </h3>

            {modelList.length === 0 ? (
              <p className="empty-message">暂无可用模型，请先通过上方下拉菜单添加或前往「添加 Provider」创建。</p>
            ) : (
              <div className="provider-select-list">
                {groupedModelList.map((group) => {
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
                          {PROVIDER_TYPE_LABELS[group.providerType] || group.providerType}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="provider-group-models">
                          {group.items.map((item) => {
                            const modelKey = item.key.replace('existing:', '');
                            const currentContextSize = contextSizeOverrides[modelKey] ||
                              (item.source === 'existing' ? kimiSettings.models[modelKey]?.max_context_size : 128000);

                            return (
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
                                    {item.display_name}
                                  </span>
                                  <span className="provider-select-model">
                                    {item.model_id}
                                  </span>
                                </div>
                                <div className="kimi-context-size-input">
                                  <label className="kimi-context-label">上下文:</label>
                                  <input
                                    type="number"
                                    className="kimi-context-input"
                                    value={currentContextSize}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '') return; // 允许清空输入框，不立即覆盖
                                      const value = parseInt(raw, 10);
                                      if (Number.isNaN(value) || value < 1) return;
                                      setContextSizeOverrides((prev) => ({
                                        ...prev,
                                        [modelKey]: value,
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      // 失焦时若为空或非法，回退到默认值
                                      const value = parseInt(e.target.value, 10);
                                      if (Number.isNaN(value) || value < 1) {
                                        const fallback = item.source === 'existing'
                                          ? kimiSettings.models[modelKey]?.max_context_size
                                          : 128000;
                                        setContextSizeOverrides((prev) => ({
                                          ...prev,
                                          [modelKey]: fallback ?? 128000,
                                        }));
                                      }
                                    }}
                                    min={1}
                                    title="上下文窗口大小（tokens）"
                                  />
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
                            );
                          })}
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
              Kimi Code config.toml 预览
            </h3>
            <button
              className="btn-link-action"
              onClick={handleOpenSettingsFile}
              title="用系统默认编辑器打开 config.toml"
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
