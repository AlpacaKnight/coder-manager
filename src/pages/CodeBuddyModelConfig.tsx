import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, CodeBuddyModel, CodeBuddyModelsConfig, CodeBuddyModelDisplay } from '../types';

interface CodeBuddyModelConfigProps {
  onClose: () => void;
  onOpenProviderMgmt: () => void;
}

export function CodeBuddyModelConfig({ onClose, onOpenProviderMgmt }: CodeBuddyModelConfigProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [modelsConfig, setModelsConfig] = useState<CodeBuddyModelsConfig>({ models: [] });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());
  const [dropdownValue, setDropdownValue] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);

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
    } catch (err) {
      console.error('Failed to load data:', err);
      setModelsConfig({ models: [] });
      setSelectedKeys(new Set());
      setDropdownAddedKeys(new Set());
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadData();
      setLoading(false);
    };
    void init();
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
      result.push({
        key,
        model_id: p.models.map((m) => m.id).join(', ') || '',
        display_name: p.name,
        vendor: p.name,
        source: 'provider',
        provider_id: p.id,
      });
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

    for (const item of modelList.filter((i) => i.source === 'provider')) {
      if (!item.provider_id) continue;
      groups.push({
        groupKey: `provider:${item.provider_id}`,
        groupTitle: item.display_name,
        items: [item],
      });
    }

    return groups;
  }, [modelList]);

  const toggleGroup = (groupKey: string) => {
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
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const idx = parseInt(item.key.replace('existing:', ''), 10);
        const m = modelsConfig.models[idx];
        if (m) selectedModels.push(m);
      } else if (item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    const config: CodeBuddyModelsConfig = {
      models: [...selectedModels],
    };

    for (const pid of newProviderIds) {
      const p = providers.find((pr) => pr.id === pid);
      if (p) {
        for (const m of p.models) {
          config.models.push({
            id: m.id,
            name: m.name,
            vendor: p.name,
            apiKey: p.api_key,
            maxInputTokens: 128000,
            maxOutputTokens: 4096,
            url: `${p.api_base_url.replace(/\/$/, '')}/chat/completions`,
            supportsToolCall: true,
            supportsImages: false,
          });
        }
      }
    }

    config.availableModels = config.models.map((m) => m.id);

    return JSON.stringify(config, null, 2);
  }, [selectedKeys, modelList, modelsConfig, providers]);

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
      alert('配置文件已删除！');
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  };

  const handleRegister = async () => {
    const keepModels: CodeBuddyModel[] = [];
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const idx = parseInt(item.key.replace('existing:', ''), 10);
        const m = modelsConfig.models[idx];
        if (m) keepModels.push(m);
      } else if (item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    // 允许保存空配置（移除所有模型）

    setRegistering(true);
    try {
      const result = await invoke<CodeBuddyModelsConfig>('apply_codebuddy_model_config', {
        customModels: keepModels,
        providerIds: newProviderIds,
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
                  const selectedCount = group.items.filter((item) =>
                    selectedKeys.has(item.key),
                  ).length;
                  const allSelected = group.items.every((item) => selectedKeys.has(item.key));

                  return (
                    <div key={group.groupKey} className="provider-group">
                      <div
                        className="provider-group-header"
                        onClick={() => toggleGroup(group.groupKey)}
                      >
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleGroup(group.groupKey)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="provider-group-title">{group.groupTitle}</span>
                        <span className="provider-group-count">
                          {selectedCount}/{group.items.length}
                        </span>
                      </div>
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
                                {item.display_name}
                              </span>
                              <span className="provider-select-model">
                                {item.model_id}
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
