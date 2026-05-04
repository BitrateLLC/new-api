/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  InputNumber,
  Layout,
  Popover,
  Select,
  Space,
  Spin,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { Code, Copy, Image as ImageIcon, Key, RotateCcw, Send, Settings2, Trash2 } from 'lucide-react';
import MarkdownRenderer from '../../components/common/markdown/MarkdownRenderer';
import { API, copy, fetchTokenKey } from '../../helpers';
import DebugPanel from '../../components/playground/DebugPanel';

const { Text, Title } = Typography;

const STORAGE_KEY = 'image_playground_config';
const MESSAGE_STORAGE_KEY = 'image_playground_messages';

const DEFAULT_CONFIG = {
  tokenId: '',
  model: 'gpt-image-1',
  prompt: '',
  n: 1,
  size: '',
  quality: '',
  responseFormat: '',
  background: '',
  outputFormat: '',
  outputCompression: null,
  moderation: '',
};

const SIZE_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: '1024x1024', value: '1024x1024' },
  { label: '1024x1536', value: '1024x1536' },
  { label: '1536x1024', value: '1536x1024' },
  { label: '1920x1088 (1080p)', value: '1920x1088' },
  { label: '2048x2048 (2K)', value: '2048x2048' },
  { label: '2048x1152 (2K)', value: '2048x1152' },
  { label: '3840x2160 (4K)', value: '3840x2160' },
  { label: '2160x3840 (4K)', value: '2160x3840' },
  { label: '1024x1792', value: '1024x1792' },
  { label: '1792x1024', value: '1792x1024' },
  { label: '512x512', value: '512x512' },
  { label: '256x256', value: '256x256' },
];

const QUALITY_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
  { label: 'standard', value: 'standard' },
  { label: 'hd', value: 'hd' },
];

const RESPONSE_FORMAT_OPTIONS = [
  { label: 'url', value: 'url' },
  { label: 'b64_json', value: 'b64_json' },
];

const BACKGROUND_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'transparent', value: 'transparent' },
  { label: 'opaque', value: 'opaque' },
];

const OUTPUT_FORMAT_OPTIONS = [
  { label: 'png', value: 'png' },
  { label: 'jpeg', value: 'jpeg' },
  { label: 'webp', value: 'webp' },
];

const MODERATION_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
];

const { Sider, Content } = Layout;

const selectFilter = (input, option) =>
  String(option.label || option.value)
    .toLowerCase()
    .includes(String(input).toLowerCase());

const FieldHint = ({ children }) => (
  <Text className='mb-2 block text-xs' style={{ color: 'var(--hp-sub)' }}>
    {children}
  </Text>
);

const loadStoredConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const storedConfig = JSON.parse(raw);
    delete storedConfig.apiKey;
    return { ...DEFAULT_CONFIG, ...storedConfig };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
};

const loadStoredMessages = () => {
  try {
    const raw = localStorage.getItem(MESSAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.messages)
        ? parsed.messages
        : [];
  } catch (error) {
    return [];
  }
};

const createMessageId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDialogMessage = (role, content, extra = {}) => ({
  id: createMessageId(),
  role,
  content,
  createAt: Date.now(),
  ...extra,
});

const normalizeStoredMessage = (message) => {
  if (!message || typeof message !== 'object') return null;
  return {
    id: message.id || createMessageId(),
    role: message.role,
    content: message.content,
    createAt: message.createAt || Date.now(),
    status: message.status,
    model: message.model,
  };
};

const compactMessageContent = (content) => {
  if (!Array.isArray(content)) return content;
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (item.url) {
        return {
          revised_prompt: item.revised_prompt,
          url: item.url,
        };
      }
      if (item.image_url?.url) {
        return {
          revised_prompt: item.revised_prompt,
          url: item.image_url.url,
        };
      }
      return item.b64_json
        ? {
            revised_prompt: item.revised_prompt,
            url: '',
          }
        : null;
    })
    .filter(Boolean);
};

const serializeMessages = (messages, compact = false) => ({
  messages: messages
    .map((message) => {
      const normalized = normalizeStoredMessage(message);
      if (!normalized) return null;
      if (!compact) return normalized;
      return {
        ...normalized,
        content: compactMessageContent(normalized.content),
      };
    })
    .filter(Boolean),
  timestamp: new Date().toISOString(),
});

const normalizeApiKey = (key) => {
  const trimmedKey = String(key || '').trim();
  if (!trimmedKey) return '';
  return trimmedKey.startsWith('sk-') ? trimmedKey : `sk-${trimmedKey}`;
};

const getModelName = (model) => {
  if (typeof model === 'string') return model.trim();
  return String(model?.id || model?.name || model?.model || '').trim();
};

const isImageModel = (model) => {
  if (model && typeof model === 'object') {
    const endpointTypes = Array.isArray(model.supported_endpoint_types)
      ? model.supported_endpoint_types
      : [];
    if (endpointTypes.includes('image-generation')) return true;
  }

  const name = getModelName(model).toLowerCase();
  return (
    name.includes('gpt-image') ||
    name.includes('dall-e') ||
    name.startsWith('imagen-') ||
    name.includes('flux')
  );
};

const toImageUrl = (item) => {
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
};

const getErrorMessage = async (response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || JSON.stringify(data);
  } catch (error) {
    try {
      return await response.text();
    } catch (textError) {
      return response.statusText;
    }
  }
};

const ImageResultGrid = ({ items, t }) => (
  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
    {items.map((item, index) => {
      const imageUrl = toImageUrl(item);
      return (
        <div
          key={`${imageUrl}-${index}`}
          className='overflow-hidden rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-1)]'
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${t('生成图片')} ${index + 1}`}
              className='h-auto max-h-[460px] w-full object-contain'
            />
          ) : (
            <div className='flex h-44 items-center justify-center text-sm text-[var(--semi-color-text-2)]'>
              {t('响应中没有图片数据')}
            </div>
          )}
          <div className='flex items-center justify-between gap-3 p-3'>
            <div className='min-w-0 flex-1'>
              {item.revised_prompt ? (
                <Text type='tertiary' size='small' className='block truncate'>
                  {item.revised_prompt}
                </Text>
              ) : (
                <Text type='tertiary' size='small'>
                  {t('生成图片')} {index + 1}
                </Text>
              )}
            </div>
            {imageUrl && (
              <Button
                size='small'
                theme='borderless'
                icon={<Copy size={14} />}
                onClick={async () => {
                  const ok = await copy(imageUrl);
                  if (ok) Toast.success(t('已复制'));
                }}
              />
            )}
          </div>
        </div>
      );
    })}
  </div>
);

const DialogMessage = ({ message, t }) => {
  const isUser = message.role === 'user';
  const isLoading = message.status === 'loading';
  const isError = message.status === 'error';
  const imageItems = Array.isArray(message.content) ? message.content : [];
  const textContent =
    typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.find((item) => item.type === 'text')?.text || ''
        : '';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${isUser ? 'max-w-[78%]' : 'max-w-[92%]'} rounded-xl px-3 py-3`}
        style={{
          background: isUser
            ? 'var(--hp-accent)'
            : isError
              ? 'rgba(220, 38, 38, 0.08)'
              : 'var(--hp-bg-soft)',
          color: isUser ? '#fff' : 'var(--hp-text)',
          border: isUser ? 'none' : '1px solid var(--hp-border)',
        }}
      >
        {isUser ? (
          <div className='prose prose-xs sm:prose-sm prose-gray max-w-none overflow-x-auto text-xs sm:text-sm'>
            <MarkdownRenderer
              content={textContent}
              className='user-message'
              animated={false}
              previousContentLength={0}
            />
          </div>
        ) : isLoading ? (
          <div className='flex items-center gap-2 py-1'>
            <Spin size='small' />
            <Text type='tertiary'>{t('生成中')}</Text>
          </div>
        ) : isError ? (
          <Text type='danger' style={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
        ) : imageItems.length > 0 ? (
          <ImageResultGrid items={imageItems} t={t} />
        ) : (
          <Text type='tertiary'>{t('响应中没有图片数据')}</Text>
        )}
      </div>
    </div>
  );
};

const ImagePlayground = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState(loadStoredConfig);
  const [models, setModels] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState(() =>
    loadStoredMessages().map(normalizeStoredMessage).filter(Boolean),
  );
  const [error, setError] = useState('');
  const [activeDebugTab, setActiveDebugTab] = useState('preview');
  const [lastRequestPayload, setLastRequestPayload] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(null);
  const [previewTimestamp, setPreviewTimestamp] = useState(null);
  const tokenKeyCacheRef = useRef(new Map());
  const tokenKeyRequestRef = useRef(new Map());
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (storageError) {
      console.warn('Failed to save image playground config:', storageError);
    }
  }, [config]);

  const persistMessages = useCallback((nextMessages) => {
    const attempts = [false, true];
    for (const compact of attempts) {
      try {
        localStorage.setItem(
          MESSAGE_STORAGE_KEY,
          JSON.stringify(serializeMessages(nextMessages, compact)),
        );
        return;
      } catch (storageError) {
        if (!compact) {
          continue;
        }
        console.warn('Failed to save image playground messages:', storageError);
      }
    }
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const commitMessages = useCallback(
    (nextMessages) => {
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      persistMessages(nextMessages);
    },
    [persistMessages],
  );

  const getSelectedTokenKey = useCallback(async () => {
    const tokenId = config.tokenId ? String(config.tokenId) : '';
    if (!tokenId) return '';

    const cachedKey = tokenKeyCacheRef.current.get(tokenId);
    if (cachedKey) return cachedKey;

    const pendingRequest = tokenKeyRequestRef.current.get(tokenId);
    if (pendingRequest) return pendingRequest;

    const request = fetchTokenKey(tokenId)
      .then((rawKey) => {
        const key = normalizeApiKey(rawKey);
        if (key) tokenKeyCacheRef.current.set(tokenId, key);
        return key;
      })
      .finally(() => {
        tokenKeyRequestRef.current.delete(tokenId);
      });
    tokenKeyRequestRef.current.set(tokenId, request);
    return request;
  }, [config.tokenId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    let mounted = true;
    const loadTokens = async () => {
      setLoadingTokens(true);
      try {
        const res = await API.get('/api/token/?p=1&size=100');
        const { success, data } = res.data || {};
        if (!success) throw new Error('Failed to load tokens');

        const tokenItems = Array.isArray(data) ? data : data?.items || [];
        const activeTokens = tokenItems.filter((token) => token.status === 1);
        if (!mounted) return;

        setTokens(activeTokens);
        setConfig((prev) => {
          const currentTokenId = prev.tokenId ? String(prev.tokenId) : '';
          if (
            currentTokenId &&
            activeTokens.some((token) => String(token.id) === currentTokenId)
          ) {
            return prev;
          }
          return {
            ...prev,
            tokenId: activeTokens.length === 1 ? String(activeTokens[0].id) : '',
          };
        });
      } catch (tokenError) {
        if (mounted) Toast.warning(t('加载令牌失败'));
      } finally {
        if (mounted) setLoadingTokens(false);
      }
    };
    loadTokens();
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      const tokenId = config.tokenId ? String(config.tokenId) : '';
      if (!tokenId) {
        setModels([]);
        setConfig((prev) => (prev.model ? { ...prev, model: '' } : prev));
        setLoadingModels(false);
        return;
      }

      setModels([]);
      setConfig((prev) => (prev.model ? { ...prev, model: '' } : prev));
      setLoadingModels(true);
      try {
        const apiKey = await getSelectedTokenKey();
        if (!apiKey) {
          throw new Error(t('请选择令牌'));
        }
        if (!mounted) return;

        const res = await API.get('/v1/models', {
          disableDuplicate: true,
          skipErrorHandler: true,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        const data = res.data?.data || res.data || {};
        const modelList = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data?.models)
              ? data.models
              : [];

        if (!mounted) return;

        const options = modelList
          .filter(isImageModel)
          .map(getModelName)
          .filter(Boolean)
          .map((model) => ({ label: model, value: model }));

        setModels(options);
        setConfig((prev) => {
          const hasCurrentModel = options.some(
            (option) => option.value === prev.model,
          );
          const nextModel =
            hasCurrentModel && options.length > 0
              ? prev.model
              : options[0]?.value || '';
          if (nextModel === prev.model) return prev;
          return { ...prev, model: nextModel };
        });
      } catch (modelError) {
        if (mounted) {
          setModels([]);
          setConfig((prev) => (prev.model ? { ...prev, model: '' } : prev));
          Toast.warning(modelError.message || t('加载模型失败'));
        }
      } finally {
        if (mounted) setLoadingModels(false);
      }
    };
    loadModels();
    return () => {
      mounted = false;
    };
  }, [config.tokenId, getSelectedTokenKey, t]);

  const requestPayload = useMemo(() => {
    const payload = {
      model: config.model.trim(),
      prompt: config.prompt,
    };

    if (typeof config.n === 'number' && config.n > 0) payload.n = config.n;
    if (config.size) payload.size = config.size;
    if (config.quality) payload.quality = config.quality;
    if (config.responseFormat) payload.response_format = config.responseFormat;
    if (config.background) payload.background = config.background;
    if (config.outputFormat) payload.output_format = config.outputFormat;
    if (
      typeof config.outputCompression === 'number' &&
      config.outputCompression >= 0
    ) {
      payload.output_compression = config.outputCompression;
    }
    if (config.moderation) payload.moderation = config.moderation;

    return payload;
  }, [config]);

  const updateConfig = useCallback((field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }, []);

  const tokenOptions = useMemo(
    () =>
      tokens.map((token) => {
        const name = token.name || `#${token.id}`;
        const maskedKey = token.key ? ` · ${token.key}` : '';
        return {
          label: `${name}${maskedKey}`,
          value: String(token.id),
        };
      }),
    [tokens],
  );

  const updateMessage = useCallback((messageId, patch) => {
    const nextMessages = messagesRef.current.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message,
    );
    commitMessages(nextMessages);
  }, [commitMessages]);

  const submit = useCallback(async () => {
    if (!config.tokenId) {
      Toast.error(t('请先选择令牌'));
      return;
    }
    if (!requestPayload.model) {
      Toast.error(t('请先选择模型'));
      return;
    }
    if (!requestPayload.prompt.trim()) {
      Toast.error(t('请填写 Prompt'));
      return;
    }

    const promptText = requestPayload.prompt.trim();
    const userMessage = createDialogMessage('user', promptText);
    const assistantMessage = createDialogMessage('assistant', '', {
      status: 'loading',
      model: requestPayload.model,
      requestPayload,
    });

    commitMessages([...messagesRef.current, userMessage, assistantMessage]);
    setConfig((prev) => ({ ...prev, prompt: '' }));
    setSubmitting(true);
    setError('');
    setLastRequestPayload(requestPayload);
    setLastRequestTime(new Date().toISOString());

    try {
      const authToken = await getSelectedTokenKey();
      const res = await fetch('/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok) {
        throw new Error(await getErrorMessage(res));
      }

      const data = await res.json();
      updateMessage(assistantMessage.id, {
        status: 'complete',
        content: data?.data || [],
        response: data,
      });
      Toast.success(t('生成成功'));
    } catch (submitError) {
      const message = submitError.message || t('请求发生错误');
      setError(message);
      updateMessage(assistantMessage.id, {
        status: 'error',
        content: message,
      });
      Toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [config.tokenId, getSelectedTokenKey, requestPayload, t, updateMessage]);

  const reset = useCallback(() => {
    setConfig((prev) => ({
      ...DEFAULT_CONFIG,
      tokenId: prev.tokenId,
    }));
    setError('');
  }, []);

  const clearMessages = useCallback(() => {
    commitMessages([]);
    setError('');
  }, [commitMessages]);

  const payloadPreview = useMemo(
    () => JSON.stringify(requestPayload, null, 2),
    [requestPayload],
  );
  const responsePreview = useMemo(
    () => {
      const latestAssistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.response);
      return JSON.stringify(latestAssistant?.response || null, null, 2);
    },
    [messages],
  );
  const lastRequestPreview = useMemo(
    () =>
      lastRequestPayload ? JSON.stringify(lastRequestPayload, null, 2) : null,
    [lastRequestPayload],
  );
  const debugData = useMemo(
    () => ({
      previewRequest: payloadPreview,
      request: lastRequestPreview,
      response: responsePreview,
      previewTimestamp,
      timestamp: lastRequestTime,
    }),
    [
      payloadPreview,
      lastRequestPreview,
      responsePreview,
      previewTimestamp,
      lastRequestTime,
    ],
  );

  useEffect(() => {
    setPreviewTimestamp(new Date().toISOString());
  }, [payloadPreview]);

  return (
    <div className='h-full min-h-0'>
      <Layout className='h-full min-h-0 bg-transparent flex flex-col lg:flex-row'>
        <Sider
          width={320}
          className='bg-transparent flex-shrink-0 overflow-auto w-full lg:w-80 lg:h-full'
          style={{ maxWidth: '100%' }}
        >
          <Card
            className='h-full flex flex-col'
            bordered={false}
            bodyStyle={{
              padding: '24px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className='flex items-center justify-between mb-5 flex-shrink-0'>
              <div className='flex items-center gap-3'>
                <div
                  className='w-8 h-8 rounded-full flex items-center justify-center'
                  style={{ background: 'rgba(var(--hp-accent-rgb), 0.12)' }}
                >
                  <Settings2 size={16} style={{ color: 'var(--hp-accent)' }} />
                </div>
                <div>
                  <Title heading={6} className='mb-0'>
                    {t('图片操练场')}
                  </Title>
                </div>
              </div>
              <Space>
                <Popover
                  trigger='click'
                  position='rightTop'
                  showArrow
                  style={{ padding: 0 }}
                  content={
                    <div className='h-[560px] w-[480px] max-w-[calc(100vw-32px)]'>
                      <DebugPanel
                        debugData={debugData}
                        activeDebugTab={activeDebugTab}
                        onActiveDebugTabChange={setActiveDebugTab}
                        styleState={{ isMobile: false }}
                      />
                    </div>
                  }
                >
                  <Button
                    size='small'
                    icon={<Code size={14} />}
                    theme='borderless'
                    type='tertiary'
                    title={t('调试信息')}
                  />
                </Popover>
                <Button
                  onClick={reset}
                  disabled={submitting}
                  size='small'
                  icon={<RotateCcw size={14} />}
                  theme='borderless'
                  type='tertiary'
                />
              </Space>
            </div>

            {error && (
              <Banner
                type='danger'
                fullMode={false}
                className='mb-4 flex-shrink-0'
                description={error}
              />
            )}

            <div className='space-y-5 overflow-y-auto flex-1 pr-1'>
              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <Key size={14} style={{ color: 'var(--hp-sub)' }} />
                  <Text strong className='text-sm'>
                    {t('令牌')}
                  </Text>
                </div>
                <FieldHint>{t('选择后加载该令牌可用模型')}</FieldHint>
                <Select
                  value={config.tokenId}
                  filter={selectFilter}
                  loading={loadingTokens}
                  optionList={tokenOptions}
                  placeholder={
                    tokenOptions.length > 0
                      ? t('请选择令牌')
                      : t('没有可用令牌')
                  }
                  disabled={!loadingTokens && tokenOptions.length === 0}
                  onChange={(value) => updateConfig('tokenId', value)}
                  style={{ width: '100%' }}
                  getPopupContainer={() => document.body}
                />
              </div>

              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <ImageIcon size={14} style={{ color: 'var(--hp-sub)' }} />
                  <Text strong className='text-sm'>
                    {t('模型')}
                  </Text>
                </div>
                <FieldHint>{t('可选择或手动输入模型')}</FieldHint>
                <Select
                  value={config.model}
                  filter={selectFilter}
                  loading={loadingModels}
                  allowCreate
                  autoClearSearchValue={false}
                  optionList={models}
                  placeholder={
                    config.tokenId
                      ? t('请选择模型')
                      : t('请先选择令牌')
                  }
                  emptyContent={
                    config.tokenId ? t('暂无数据') : t('请先选择令牌')
                  }
                  disabled={!config.tokenId || loadingModels}
                  onChange={(value) => updateConfig('model', value)}
                  style={{ width: '100%' }}
                  getPopupContainer={() => document.body}
                />
              </div>

              <div className='space-y-3'>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('尺寸')}
                  </Text>
                  <FieldHint>{t('留空使用默认尺寸')}</FieldHint>
                  <Select
                    value={config.size}
                    placeholder={t('默认')}
                    optionList={SIZE_OPTIONS}
                    onChange={(value) => updateConfig('size', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('质量')}
                  </Text>
                  <FieldHint>{t('留空使用默认质量')}</FieldHint>
                  <Select
                    value={config.quality}
                    placeholder={t('默认')}
                    optionList={QUALITY_OPTIONS}
                    onChange={(value) => updateConfig('quality', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('响应格式')}
                  </Text>
                  <FieldHint>{t('URL 或 Base64，留空默认')}</FieldHint>
                  <Select
                    value={config.responseFormat}
                    placeholder={t('默认')}
                    showClear
                    optionList={RESPONSE_FORMAT_OPTIONS}
                    onChange={(value) => updateConfig('responseFormat', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('背景')}
                  </Text>
                  <FieldHint>{t('透明背景需模型支持')}</FieldHint>
                  <Select
                    value={config.background}
                    placeholder={t('默认')}
                    optionList={BACKGROUND_OPTIONS}
                    onChange={(value) => updateConfig('background', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('输出格式')}
                  </Text>
                  <FieldHint>{t('生成图片的文件格式')}</FieldHint>
                  <Select
                    value={config.outputFormat}
                    placeholder={t('默认')}
                    optionList={OUTPUT_FORMAT_OPTIONS}
                    onChange={(value) => updateConfig('outputFormat', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('输出压缩')}
                  </Text>
                  <FieldHint>{t('范围 0-100，视格式生效')}</FieldHint>
                  <InputNumber
                    min={0}
                    max={100}
                    step={1}
                    value={config.outputCompression}
                    placeholder={t('默认')}
                    onChange={(value) => updateConfig('outputCompression', value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('审核级别')}
                  </Text>
                  <FieldHint>{t('留空使用默认审核')}</FieldHint>
                  <Select
                    value={config.moderation}
                    placeholder={t('默认')}
                    optionList={MODERATION_OPTIONS}
                    onChange={(value) => updateConfig('moderation', value)}
                    style={{ width: '100%' }}
                    getPopupContainer={() => document.body}
                  />
                </div>
              </div>
            </div>
          </Card>
        </Sider>

        <Content className='flex-1 min-h-0 overflow-hidden'>
          <div className='h-full min-h-0 flex flex-col'>
            <Card
              className='flex-1 min-h-0'
              bordered={false}
              style={{ background: 'var(--hp-card)', borderRadius: '16px' }}
              bodyStyle={{
                padding: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                className='px-5 py-3 flex-shrink-0'
                style={{
                  borderBottom: '1px solid var(--hp-border)',
                  background: 'var(--hp-card)',
                }}
              >
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-3'>
                    <div
                      className='w-8 h-8 rounded-full flex items-center justify-center'
                      style={{ background: 'rgba(var(--hp-accent-rgb), 0.12)' }}
                    >
                      <ImageIcon size={16} style={{ color: 'var(--hp-accent)' }} />
                    </div>
                    <div>
                      <Title heading={6} className='mb-0'>
                        {t('生成结果')}
                      </Title>
                      <Text type='tertiary' className='text-xs'>
                        {requestPayload.model}
                      </Text>
                    </div>
                  </div>
                  {messages.length > 0 && (
                    <Button
                      size='small'
                      icon={<Trash2 size={14} />}
                      theme='borderless'
                      type='tertiary'
                      onClick={clearMessages}
                    >
                      {t('清空')}
                    </Button>
                  )}
                </div>
              </div>

              <div className='flex-1 min-h-0 overflow-hidden px-4 pt-4'>
                {messages.length > 0 ? (
                  <div className='flex h-full min-h-0 flex-col gap-4 overflow-auto pr-1 pb-4'>
                    {messages.map((message) => (
                      <DialogMessage key={message.id} message={message} t={t} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className='flex h-full min-h-[260px] items-center justify-center text-[var(--semi-color-text-2)]'>
                    {t('生成结果会显示在这里')}
                  </div>
                )}
              </div>

              <div
                className='flex-shrink-0'
                style={{ padding: '8px 16px', maxWidth: '100%' }}
              >
                <div
                  className='flex items-center gap-2 min-w-0'
                  style={{
                    padding: '8px 12px',
                    background: 'var(--hp-bg-soft)',
                    borderRadius: '16px',
                    border: '1px solid var(--hp-border)',
                    boxShadow: 'var(--hp-shadow)',
                    transition: 'box-shadow 0.2s ease',
                  }}
                >
                  <TextArea
                    value={config.prompt}
                    placeholder={t('描述你想生成的图片')}
                    autosize={{ minRows: 1, maxRows: 5 }}
                    onChange={(value) => updateConfig('prompt', value)}
                    onEnterPress={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    className='image-playground-prompt'
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      resize: 'none',
                      minHeight: 32,
                      padding: 0,
                      boxShadow: 'none',
                    }}
                  />
                  <Button
                    type='primary'
                    theme='solid'
                    icon={<Send size={16} />}
                    loading={submitting}
                    onClick={submit}
                    style={{
                      borderRadius: '50%',
                      width: 32,
                      height: 32,
                      minWidth: 32,
                      padding: 0,
                      background: 'var(--hp-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                    }}
                  />
                </div>
              </div>
            </Card>

          </div>
        </Content>
      </Layout>
    </div>
  );
};

export default ImagePlayground;
