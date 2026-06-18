import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Provider, ProviderType, ModelEntry } from '../types';

interface ProviderManagementProps {
  onClose: () => void;
}

interface ProviderForm {
  id: string;
  name: string;
  api_base_url: string;
  api_key: string;
  provider_type: ProviderType;
  models: ModelEntry[];
}

const EMPTY_FORM: ProviderForm = {
  id: '',
  name: '',
  api_base_url: '',
  api_key: '',
  provider_type: 'openai',
  models: [{ id: '', name: '' }],
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProviderForm>(EMPTY_FORM);
  const [showAddKey, setShowAddKey] = useState(false);
  const [showEditKey, setShowEditKey] = useState(false);

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

  // 表单校验：models 至少 1 个 id 和 name 都非空的条目
  const validateForm = (f: ProviderForm): string | null => {
    if (!f.id.trim()) return '请填写 Provider ID';
    if (!f.name.trim()) return '请填写显示名称';
    if (!f.api_base_url.trim()) return '请填写 API Base URL';
    const validModels = f.models.filter((m) => m.id.trim() && m.name.trim());
    if (validModels.length === 0) return '请至少添加一个有效的模型（id 和名称均非空）';
    return null;
  };

  // 构建提交用的 Provider 对象（只保留有效模型）
  const buildProvider = (f: ProviderForm): Provider => ({
    id: f.id.trim(),
    name: f.name.trim(),
    api_base_url: f.api_base_url.trim(),
    api_key: f.api_key.trim(),
    provider_type: f.provider_type,
    models: f.models
      .filter((m) => m.id.trim() && m.name.trim())
      .map((m) => ({ id: m.id.trim(), name: m.name.trim() })),
  });

  const handleAddProvider = async () => {
    const err = validateForm(form);
    if (err) {
      alert(err);
      return;
    }

    const provider = buildProvider(form);
    try {
      await invoke('create_provider', { provider });
      setForm(EMPTY_FORM);
      setShowAddKey(false);
      await loadProviders();
    } catch (e) {
      alert(`添加失败: ${e}`);
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

  const handleEditStart = (p: Provider) => {
    setEditingId(p.id);
    setShowEditKey(false);
    const models =
      p.models.length > 0
        ? p.models.map((m) => ({ ...m }))
        : [{ id: '', name: '' }];
    setEditForm({
      id: p.id,
      name: p.name,
      api_base_url: p.api_base_url,
      api_key: p.api_key,
      provider_type: p.provider_type,
      models,
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
  };

  const handleEditSave = async () => {
    const err = validateForm(editForm);
    if (err) {
      alert(err);
      return;
    }

    const updated = buildProvider(editForm);
    const next = providers.map((p) => (p.id === editingId ? updated : p));
    try {
      await invoke('save_providers', { providers: next });
      setProviders(next);
      setEditingId(null);
    } catch (e) {
      alert(`保存失败: ${e}`);
    }
  };

  // 模型键值对操作（新增表单）
  const addModelField = () => {
    setForm((f) => ({ ...f, models: [...f.models, { id: '', name: '' }] }));
  };
  const removeModelField = (idx: number) => {
    setForm((f) => ({
      ...f,
      models: f.models.filter((_, i) => i !== idx),
    }));
  };
  const updateModelField = (idx: number, field: keyof ModelEntry, value: string) => {
    setForm((f) => ({
      ...f,
      models: f.models.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    }));
  };

  // 模型键值对操作（编辑表单）
  const addEditModelField = () => {
    setEditForm((f) => ({ ...f, models: [...f.models, { id: '', name: '' }] }));
  };
  const removeEditModelField = (idx: number) => {
    setEditForm((f) => ({
      ...f,
      models: f.models.filter((_, i) => i !== idx),
    }));
  };
  const updateEditModelField = (idx: number, field: keyof ModelEntry, value: string) => {
    setEditForm((f) => ({
      ...f,
      models: f.models.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    }));
  };

  const typeLabel = (type: string) =>
    PROVIDER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

  const renderModelFields = (
    models: ModelEntry[],
    onAdd: () => void,
    onRemove: (idx: number) => void,
    onUpdate: (idx: number, field: keyof ModelEntry, value: string) => void,
  ) => (
    <div className="model-pair-list">
      {models.map((m, idx) => (
        <div key={idx} className="model-pair-row">
          <input
            className="model-config-input"
            placeholder="模型 ID"
            value={m.id}
            onChange={(e) => onUpdate(idx, 'id', e.target.value)}
          />
          <input
            className="model-config-input"
            placeholder="显示名称"
            value={m.name}
            onChange={(e) => onUpdate(idx, 'name', e.target.value)}
          />
          {models.length > 1 && (
            <button
              className="btn-remove-model"
              type="button"
              onClick={() => onRemove(idx)}
              title="删除此模型"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button className="btn-add-model" type="button" onClick={onAdd}>
        + 添加模型
      </button>
    </div>
  );

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
              <div className="password-input-wrapper">
                <input
                  className="model-config-input"
                  type={showAddKey ? 'text' : 'password'}
                  placeholder="API Key"
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                />
                <button
                  className="btn-toggle-password"
                  type="button"
                  onClick={() => setShowAddKey((v) => !v)}
                  title={showAddKey ? '隐藏密码' : '显示密码'}
                >
                  {showAddKey ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="provider-form-row">
              <select
                className="model-config-input model-config-select"
                value={form.provider_type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    provider_type: e.target.value as ProviderType,
                  }))
                }
              >
                {PROVIDER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {renderModelFields(
              form.models,
              addModelField,
              removeModelField,
              updateModelField,
            )}
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
              {providers.map((p) => {
                if (editingId === p.id) {
                  return (
                    <div key={p.id} className="provider-edit-form">
                      <div className="provider-edit-row">
                        <input
                          className="model-config-input"
                          placeholder="显示名称"
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="provider-edit-row">
                        <input
                          className="model-config-input"
                          placeholder="API Base URL"
                          value={editForm.api_base_url}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, api_base_url: e.target.value }))
                          }
                        />
                        <div className="password-input-wrapper">
                          <input
                            className="model-config-input"
                            type={showEditKey ? 'text' : 'password'}
                            placeholder="API Key"
                            value={editForm.api_key}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, api_key: e.target.value }))
                            }
                          />
                          <button
                            className="btn-toggle-password"
                            type="button"
                            onClick={() => setShowEditKey((v) => !v)}
                            title={showEditKey ? '隐藏密码' : '显示密码'}
                          >
                            {showEditKey ? '🙈' : '👁'}
                          </button>
                        </div>
                      </div>
                      <div className="provider-edit-row">
                        <select
                          className="model-config-input model-config-select"
                          value={editForm.provider_type}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              provider_type: e.target.value as ProviderType,
                            }))
                          }
                        >
                          {PROVIDER_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {renderModelFields(
                        editForm.models,
                        addEditModelField,
                        removeEditModelField,
                        updateEditModelField,
                      )}
                      <div className="provider-edit-actions">
                        <button
                          className="btn-add-provider"
                          onClick={handleEditSave}
                        >
                          保存
                        </button>
                        <button
                          className="btn-link-action"
                          onClick={handleEditCancel}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={p.id} className="provider-item">
                    <div className="provider-info">
                      <span className="provider-name">{p.name}</span>
                      <span className="provider-detail">
                        {p.models.map((m) => m.id).join(', ') || p.model_name || '—'}
                      </span>
                      <span className="provider-detail">{p.api_base_url}</span>
                      <span className="provider-type-badge">
                        {typeLabel(p.provider_type)}
                      </span>
                    </div>
                    <button
                      className="btn-provider-edit"
                      onClick={() => handleEditStart(p)}
                      title="修改"
                    >
                      ✎
                    </button>
                    <button
                      className="btn-provider-delete"
                      onClick={() => handleDeleteProvider(p.id)}
                    >
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
