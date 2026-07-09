import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, CodeBuddyModel, CodeBuddyModelsConfig, CodeBuddyModelDisplay } from '../types';

interface CodeBuddyModelConfigProps {
  onClose: () => void;
  onOpenProviderMgmt: () => void;
}

/** 根据 Provider 类型构造 API 端点 URL */
const getEndpoint = (providerType: string, baseUrl: string): string => {
  const base = baseUrl.replace(/\/$/, '');
  return providerType === 'anthropic'
    ? `${base}/v1/messages`
    : `${base}/chat/completions`;
};

export function CodeBuddyModelConfig({ onClose, onOpenProviderMgmt }: CodeBuddyModelConfigProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [modelsConfig, setModelsConfig] = useState<CodeBuddyModelsConfig>({ models: [] });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());
  const [dropdownValue, setDropdownValue] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // 模型上下文长度覆盖：key 为 modelId，value 为 { input, output }
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, { input: number; output: number }>>({});

  const loadData = useCallback(async () => {
    try {
      const [providerData, config] = await Promise.all([
        invoke<Provider[]>('get_providers'),
        invoke<CodeBuddyModelsConfig>('load_codebuddy_models_config'),
      ]);
      setProviders(providerData);
      setModelsConfig(config);

      const keys = new Set<string>();
      for (let i = 0; i < config.models.length; i++) {
        keys.add(`existing:${i}`);
      }
      setSelectedKeys(keys);
      setDropdownAddedKeys(new Set());
      setTokenOverrides({});
    } catch (err) {
      console.error('Failed to load data:', err);
      setModelsConfig({ models: [] });
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

  const modelList = useMemo((): CodeBuddyModelDisplay[] => {
    const result: CodeBuddyModelDisplay[] = [];

    for (let i = 0; i < modelsConfig.models.length; i++) {
      const m = modelsConfig.models[i];
      result.push({
        key: `existing:${i}`,
        model_id: m.id,
        display_name: m.name || m.id,
        vendor: m.vendor || 'Unknown',
        source: 'existing',
      });
    }

    for (const key of dropdownAddedKeys) {
      const pid = key.replace('provider:', '');
      const p = providers.find((pr) => pr.id === pid);
      if (!p) continue;
      // 按模型展开：每个模型都是独立勾选项（与 existing 一致）
      for (const m of p.models) {
        result.push({
          key: `provider:${pid}::${m.id}`,
          model_id: m.id,
          display_name: m.name || m.id,
          vendor: p.name,
          source: 'provider',
          provider_id: p.id,
        });
      }
    }

    return result;
  }, [providers, modelsConfig, dropdownAddedKeys]);

  const groupedModelList = useMemo(() => {
    const groups: {
      groupKey: string;
      groupTitle: string;
      items: CodeBuddyModelDisplay[];
    }[] = [];

    const vendorGroups = new Map<string, CodeBuddyModelDisplay[]>();
    for (const item of modelList.filter((i) => i.source === 'existing')) {
      const groupKey = item.vendor;
      if (!vendorGroups.has(groupKey)) {
        vendorGroups.set(groupKey, []);
      }
      vendorGroups.get(groupKey)!.push(item);
    }

    for (const [vendor, items] of vendorGroups) {
      groups.push({
        groupKey: `existing:${vendor}`,
        groupTitle: vendor,
        items,
      });
    }

    // 新增 Provider：按 provider_id 聚合为一组，组内每个模型单独可选
    const providerGroups = new Map<string, CodeBuddyModelDisplay[]>();
    for (const item of modelList.filter((i) => i.source === 'provider')) {
      if (!item.provider_id) continue;
      if (!providerGroups.has(item.provider_id)) {
        providerGroups.set(item.provider_id, []);
      }
      providerGroups.get(item.provider_id)!.push(item);
    }
    for (const [pid, items] of providerGroups) {
      groups.push({
        groupKey: `provider:${pid}`,
        groupTitle: items[0]?.vendor || pid,
        items,
      });
    }

    return groups;
  }, [modelList]);

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
    const selectedModels: CodeBuddyModel[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const idx = parseInt(item.key.replace('existing:', ''), 10);
        const m = modelsConfig.models[idx];
        if (m) {
          // 应用用户修改的上下文长度
          const ov = tokenOverrides[m.id];
          selectedModels.push(ov ? { ...m, maxInputTokens: ov.input, maxOutputTokens: ov.output } : m);
        }
      } else if (item.provider_id) {
        // 新增 provider 的单个模型项：按勾选构造独立 entry
        const p = providers.find((pr) => pr.id === item.provider_id);
        if (p) {
          const ov = tokenOverrides[item.model_id];
          selectedModels.push({
            id: item.model_id,
            name: item.display_name,
            vendor: p.name,
            apiKey: p.api_key,
            maxInputTokens: ov?.input ?? 128000,
            maxOutputTokens: ov?.output ?? 4096,
            url: getEndpoint(p.provider_type, p.api_base_url),
            supportsToolCall: true,
            supportsImages: false,
          });
        }
      }
    }

    const config: CodeBuddyModelsConfig = {
      models: [...selectedModels],
    };
    config.availableModels = config.models.map((m) => m.id);

    return JSON.stringify(config, null, 2);
  }, [selectedKeys, modelList, modelsConfig, providers, tokenOverrides]);

  const handleDropdownAdd = () => {
    if (!dropdownValue) return;
    const pid = dropdownValue;
    const p = providers.find((pr) => pr.id === pid);
    // dropdownAddedKeys 存整 provider key（过滤下拉项），selectedKeys 存各模型项 key
    setDropdownAddedKeys((prev) => new Set(prev).add(`provider:${pid}`));
    if (p && p.models.length > 0) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const m of p.models) next.add(`provider:${pid}::${m.id}`);
        return next;
      });
    }
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
      await invoke('open_codebuddy_models_config_file');
    } catch (err) {
      alert(`打开失败: ${err}`);
    }
  };

  const handleDeleteConfig = async () => {
    if (!confirm('确定要删除 CodeBuddy 模型配置文件吗？此操作不可撤销。')) {
      return;
    }
    try {
      await invoke('delete_codebuddy_models_config');
      setModelsConfig({ models: [] });
      setSelectedKeys(new Set());
      setDropdownAddedKeys(new Set());
      setTokenOverrides({});
      alert('配置文件已删除！');
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  };

  const handleRegister = async () => {
    const keepModels: CodeBuddyModel[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const idx = parseInt(item.key.replace('existing:', ''), 10);
        const m = modelsConfig.models[idx];
        if (m) {
          // 应用用户修改的上下文长度（避免只改了预览没落盘）
          const ov = tokenOverrides[m.id];
          keepModels.push(ov ? { ...m, maxInputTokens: ov.input, maxOutputTokens: ov.output } : m);
        }
      } else if (item.provider_id) {
        // 新增 provider 的单个模型项：按勾选构造独立 entry，不再依赖后端展开
        const p = providers.find((pr) => pr.id === item.provider_id);
        if (p) {
          const ov = tokenOverrides[item.model_id];
          keepModels.push({
            id: item.model_id,
            name: item.display_name,
            vendor: p.name,
            apiKey: p.api_key,
            maxInputTokens: ov?.input ?? 128000,
            maxOutputTokens: ov?.output ?? 4096,
            url: getEndpoint(p.provider_type, p.api_base_url),
            supportsToolCall: true,
            supportsImages: false,
          });
        }
      }
    }

    // 允许保存空配置（移除所有模型）；providerIds 恒为空，模型由 customModels 决定

    setRegistering(true);
    try {
      const result = await invoke<CodeBuddyModelsConfig>('apply_codebuddy_model_config', {
        customModels: keepModels,
        providerIds: [],
      });
      setModelsConfig(result);
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
        <h2>配置 CodeBuddy 模型</h2>
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
                      </div>
                      {isExpanded && (
                        <div className="provider-group-models">
                          {group.items.map((item) => {
                            // existing 模型从原始配置读取 token 值
                            const existingModel = item.source === 'existing'
                              ? modelsConfig.models[parseInt(item.key.replace('existing:', ''), 10)]
                              : undefined;
                            const currentInput = tokenOverrides[item.model_id]?.input
                              ?? existingModel?.maxInputTokens
                              ?? 128000;
                            const currentOutput = tokenOverrides[item.model_id]?.output
                              ?? existingModel?.maxOutputTokens
                              ?? 4096;

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
                                  <label className="kimi-context-label">输入:</label>
                                  <input
                                    type="number"
                                    className="kimi-context-input"
                                    value={currentInput}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '') return; // 允许清空输入框，不立即覆盖
                                      const value = parseInt(raw, 10);
                                      if (Number.isNaN(value) || value < 1) return;
                                      setTokenOverrides((prev) => ({
                                        ...prev,
                                        [item.model_id]: {
                                          input: value,
                                          output: prev[item.model_id]?.output ?? currentOutput,
                                        },
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      // 失焦时若为空或非法，回退到默认值
                                      const value = parseInt(e.target.value, 10);
                                      if (Number.isNaN(value) || value < 1) {
                                        setTokenOverrides((prev) => ({
                                          ...prev,
                                          [item.model_id]: {
                                            input: existingModel?.maxInputTokens ?? 128000,
                                            output: prev[item.model_id]?.output ?? currentOutput,
                                          },
                                        }));
                                      }
                                    }}
                                    min={1}
                                    title="最大输入 tokens"
                                  />
                                  <label className="kimi-context-label">输出:</label>
                                  <input
                                    type="number"
                                    className="kimi-context-input"
                                    value={currentOutput}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === '') return; // 允许清空输入框，不立即覆盖
                                      const value = parseInt(raw, 10);
                                      if (Number.isNaN(value) || value < 1) return;
                                      setTokenOverrides((prev) => ({
                                        ...prev,
                                        [item.model_id]: {
                                          input: prev[item.model_id]?.input ?? currentInput,
                                          output: value,
                                        },
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      // 失焦时若为空或非法，回退到默认值
                                      const value = parseInt(e.target.value, 10);
                                      if (Number.isNaN(value) || value < 1) {
                                        setTokenOverrides((prev) => ({
                                          ...prev,
                                          [item.model_id]: {
                                            input: prev[item.model_id]?.input ?? currentInput,
                                            output: existingModel?.maxOutputTokens ?? 4096,
                                          },
                                        }));
                                      }
                                    }}
                                    min={1}
                                    title="最大输出 tokens"
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
              CodeBuddy models.json 预览
            </h3>
            <button
              className="btn-link-action"
              onClick={handleOpenSettingsFile}
              title="用系统默认编辑器打开 models.json"
            >
              打开配置文件
            </button>
          </div>
          <pre className="settings-preview">{preview}</pre>
        </div>
      </div>

      <div className="model-config-actions">
        <button
          className="btn-danger"
          onClick={handleDeleteConfig}
          title="彻底删除 models.json 配置文件"
        >
          删除配置文件
        </button>
        <div className="model-config-actions-spacer" />
        <button
          className="btn-primary"
          onClick={handleRegister}
          disabled={registering}
        >
          {registering ? '应用中...' : '应用配置'}
        </button>
      </div>
    </div>
  );
}
