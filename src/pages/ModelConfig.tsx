import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, QwenModel, ModelDisplay } from '../types';

interface ModelConfigProps {
  onClose: () => void;
  onOpenProviderMgmt: () => void;
}

const PROTOCOL_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export function ModelConfig({ onClose, onOpenProviderMgmt }: ModelConfigProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [existingOpenai, setExistingOpenai] = useState<QwenModel[]>([]);
  const [existingAnthropic, setExistingAnthropic] = useState<QwenModel[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [dropdownAddedKeys, setDropdownAddedKeys] = useState<Set<string>>(new Set());
  const [dropdownValue, setDropdownValue] = useState('');
  const [currentSettings, setCurrentSettings] = useState<Record<string, unknown>>({});
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [providerData, settings] = await Promise.all([
        invoke<Provider[]>('get_providers'),
        invoke<Record<string, unknown>>('load_qwen_settings'),
      ]);
      setProviders(providerData);
      setCurrentSettings(settings);

      const mp = (settings.modelProviders ?? {}) as Record<string, unknown>;
      const oai = (mp.openai ?? []) as QwenModel[];
      const ant = (mp.anthropic ?? []) as QwenModel[];
      setExistingOpenai(oai);
      setExistingAnthropic(ant);

      const keys = new Set<string>();
      for (const m of oai) keys.add(`existing:openai:${m.id}`);
      for (const m of ant) keys.add(`existing:anthropic:${m.id}`);
      setSelectedKeys(keys);
      setDropdownAddedKeys(new Set());
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadData();
      setLoading(false);
    };
    void init();
  }, [loadData]);

  // 下拉菜单可选 Provider（仅过滤接口类型和已通过下拉添加的）
  const dropdownOptions = useMemo(() => {
    return providers.filter((p) => {
      if (p.provider_type !== 'openai' && p.provider_type !== 'openai-responses' && p.provider_type !== 'anthropic') {
        return false;
      }
      const key = `provider:${p.id}`;
      if (dropdownAddedKeys.has(key)) return false;
      return true;
    });
  }, [providers, dropdownAddedKeys]);

  // 构建统一展示列表
  const modelList = useMemo((): ModelDisplay[] => {
    const result: ModelDisplay[] = [];

    for (const m of existingOpenai) {
      result.push({
        key: `existing:openai:${m.id}`,
        model_name: m.id,
        display_name: m.name,
        protocol: 'openai',
        source: 'existing',
      });
    }
    for (const m of existingAnthropic) {
      result.push({
        key: `existing:anthropic:${m.id}`,
        model_name: m.id,
        display_name: m.name,
        protocol: 'anthropic',
        source: 'existing',
      });
    }

    // 通过下拉菜单新增的 Provider
    for (const key of dropdownAddedKeys) {
      const pid = key.replace('provider:', '');
      const p = providers.find((pr) => pr.id === pid);
      if (!p) continue;
      const protocol = p.provider_type === 'anthropic' ? 'anthropic' : 'openai';
      result.push({
        key,
        model_name: p.model_name,
        display_name: p.name,
        protocol,
        source: 'provider',
        provider_id: p.id,
      });
    }

    return result;
  }, [providers, existingOpenai, existingAnthropic, dropdownAddedKeys]);

  // 预览
  const preview = useMemo(() => {
    const keepOpenai: QwenModel[] = [];
    const keepAnthropic: QwenModel[] = [];
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const existingModels = item.protocol === 'openai' ? existingOpenai : existingAnthropic;
        const found = existingModels.find((m) => m.id === item.model_name);
        if (found) {
          if (item.protocol === 'openai') keepOpenai.push(found);
          else keepAnthropic.push(found);
        }
      } else if (item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    const merged = JSON.parse(JSON.stringify(currentSettings)) as Record<string, unknown>;
    merged.$version = 4;

    const allOpenai = [...keepOpenai];
    const allAnthropic = [...keepAnthropic];

    for (const pid of newProviderIds) {
      const p = providers.find((pr) => pr.id === pid);
      if (!p) continue;
      const entry: QwenModel = {
        id: p.model_name,
        name: p.name,
        baseUrl: p.api_base_url,
        envKey: `${p.id.toUpperCase()}_API_KEY`,
        providerType: p.provider_type,
      };
      if (p.provider_type === 'anthropic') allAnthropic.push(entry);
      else allOpenai.push(entry);
    }

    if (!merged.modelProviders || typeof merged.modelProviders !== 'object') {
      merged.modelProviders = {};
    }
    const mp = merged.modelProviders as Record<string, unknown>;
    mp.openai = allOpenai;
    mp.anthropic = allAnthropic;

    if (!merged.security || typeof merged.security !== 'object') {
      merged.security = {};
    }
    const sec = merged.security as Record<string, unknown>;
    if (!sec.auth || typeof sec.auth !== 'object') {
      sec.auth = {};
    }
    (sec.auth as Record<string, unknown>).selectedType =
      allAnthropic.length > 0 ? 'anthropic' : 'openai';

    if (!merged.env || typeof merged.env !== 'object') {
      merged.env = {};
    }
    const env = merged.env as Record<string, unknown>;
    for (const pid of newProviderIds) {
      const p = providers.find((pr) => pr.id === pid);
      if (p) env[`${p.id.toUpperCase()}_API_KEY`] = p.api_key;
    }

    if (!merged.model || typeof merged.model !== 'object') {
      merged.model = {};
    }
    const model = merged.model as Record<string, unknown>;
    const allIds = [...allOpenai, ...allAnthropic].map((m) => m.id);
    const currentName = (model.name as string) || '';
    if (allIds.length > 0 && (!currentName || !allIds.includes(currentName))) {
      model.name = allIds[0];
    }

    return JSON.stringify(merged, null, 2);
  }, [selectedKeys, modelList, existingOpenai, existingAnthropic, currentSettings, providers]);

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

  const handleRegister = async () => {
    const keepOpenai: QwenModel[] = [];
    const keepAnthropic: QwenModel[] = [];
    const newProviderIds: string[] = [];

    for (const item of modelList) {
      if (!selectedKeys.has(item.key)) continue;

      if (item.source === 'existing') {
        const existingModels = item.protocol === 'openai' ? existingOpenai : existingAnthropic;
        const found = existingModels.find((m) => m.id === item.model_name);
        if (found) {
          if (item.protocol === 'openai') keepOpenai.push(found);
          else keepAnthropic.push(found);
        }
      } else if (item.provider_id) {
        newProviderIds.push(item.provider_id);
      }
    }

    if (keepOpenai.length + keepAnthropic.length + newProviderIds.length === 0) {
      alert('请至少选择一个模型');
      return;
    }

    setRegistering(true);
    try {
      const result = await invoke<Record<string, unknown>>('apply_qwen_model_config', {
        openaiModels: keepOpenai,
        anthropicModels: keepAnthropic,
        providerIds: newProviderIds,
      });
      setCurrentSettings(result);
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
        <h2>配置 Qwen Code 模型</h2>
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
                    {p.name} ({p.model_name})
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
                {modelList.map((item) => (
                  <label key={item.key} className="provider-select-item">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(item.key)}
                      onChange={() => toggleSelect(item.key)}
                    />
                    <div className="provider-select-info">
                      <span className="provider-select-name">{item.display_name}</span>
                      <span className="provider-select-model">{item.model_name}</span>
                    </div>
                    <span className={`provider-protocol-tag protocol-${item.protocol}`}>
                      {PROTOCOL_LABELS[item.protocol]}
                    </span>
                    {item.source === 'existing' && (
                      <span className="provider-source-badge">已注册</span>
                    )}
                    {item.source === 'provider' && (
                      <span className="provider-source-badge provider-source-new">新增</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="model-config-right">
          <h3 className="model-config-section-title">
            Qwen Code settings.json 预览
          </h3>
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
