import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, ProviderType } from '../types';

interface ProviderManagementProps {
  onClose: () => void;
}

interface ProviderForm {
  id: string;
  name: string;
  api_base_url: string;
  model_name: string;
  api_key: string;
  provider_type: ProviderType;
}

const EMPTY_FORM: ProviderForm = {
  id: '',
  name: '',
  api_base_url: '',
  model_name: '',
  api_key: '',
  provider_type: 'openai',
};

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI 兼容接口' },
  { value: 'openai-responses', label: 'OpenAI Response 接口' },
  { value: 'anthropic', label: 'Anthropic Message 接口' },
];

export function ProviderManagement({ onClose }: ProviderManagementProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      const data = await invoke<Provider[]>('get_providers');
      setProviders(data);
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadProviders();
      setLoading(false);
    };
    void init();
  }, [loadProviders]);

  const handleAddProvider = async () => {
    if (!form.id.trim() || !form.name.trim() || !form.api_base_url.trim() || !form.model_name.trim()) {
      alert('请填写所有必填字段');
      return;
    }

    const provider: Provider = {
      id: form.id.trim(),
      name: form.name.trim(),
      api_base_url: form.api_base_url.trim(),
      model_name: form.model_name.trim(),
      api_key: form.api_key.trim(),
      provider_type: form.provider_type,
    };

    try {
      await invoke('create_provider', { provider });
      setForm(EMPTY_FORM);
      await loadProviders();
    } catch (err) {
      alert(`添加失败: ${err}`);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await invoke('delete_provider', { id });
      await loadProviders();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  };

  const typeLabel = (type: string) =>
    PROVIDER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

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
        <button className="btn-back" onClick={onClose} title="返回">←</button>
        <h2>添加 Provider</h2>
      </div>

      <div className="provider-mgmt-body">
        <div className="provider-mgmt-form-section">
          <h3 className="model-config-section-title">新增 Provider</h3>

          <div className="provider-form">
            <div className="provider-form-row">
              <input
                className="model-config-input"
                placeholder="ID (英文标识)"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              />
              <input
                className="model-config-input"
                placeholder="显示名称"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <input
              className="model-config-input"
              placeholder="API Base URL"
              value={form.api_base_url}
              onChange={(e) => setForm((f) => ({ ...f, api_base_url: e.target.value }))}
            />
            <div className="provider-form-row">
              <input
                className="model-config-input"
                placeholder="模型名称 (model ID)"
                value={form.model_name}
                onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
              />
              <input
                className="model-config-input"
                type="password"
                placeholder="API Key"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              />
            </div>
            <div className="provider-form-row">
              <select
                className="model-config-input model-config-select"
                value={form.provider_type}
                onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value as ProviderType }))}
              >
                {PROVIDER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-add-provider" onClick={handleAddProvider}>
              + 新增 Provider
            </button>
          </div>
        </div>

        <div className="provider-mgmt-list-section">
          <h3 className="model-config-section-title">已保存的 Provider</h3>
          {providers.length === 0 ? (
            <p className="empty-message">暂无 Provider，请先添加。</p>
          ) : (
            <div className="provider-list">
              {providers.map((p) => (
                <div key={p.id} className="provider-item">
                  <div className="provider-info">
                    <span className="provider-name">{p.name}</span>
                    <span className="provider-detail">{p.model_name}</span>
                    <span className="provider-detail">{p.api_base_url}</span>
                    <span className="provider-type-badge">{typeLabel(p.provider_type)}</span>
                  </div>
                  <button
                    className="btn-provider-delete"
                    onClick={() => handleDeleteProvider(p.id)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
