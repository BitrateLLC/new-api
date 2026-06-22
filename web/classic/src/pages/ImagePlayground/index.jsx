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

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Card,
  Chat,
  InputNumber,
  Layout,
  Popover,
  Radio,
  Select,
  Space,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Code,
  Image as ImageIcon,
  ImagePlus,
  RotateCcw,
  Send,
  Settings2,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { UserContext } from '../../context/User';
import { useActualTheme } from '../../context/Theme';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import {
  API,
  copy,
  encodeToBase64,
  getLogo,
  processGroupsData,
  stringToColor,
} from '../../helpers';
import DebugPanel from '../../components/playground/DebugPanel';
import {
  OptimizedMessageActions,
  OptimizedMessageContent,
} from '../../components/playground/OptimizedComponents';

const { Text, Title } = Typography;

const STORAGE_KEY = 'image_playground_config';
const MESSAGE_STORAGE_KEY = 'image_playground_messages';
const IMAGE_ASSET_DB_NAME = 'new-api-image-playground';
const IMAGE_ASSET_STORE_NAME = 'image_assets';
const imageObjectUrls = new Set();

const DEFAULT_CONFIG = {
  group: '',
  model: '',
  playgroundMode: 'text-to-image',
  prompt: '',
  size: '',
  quality: '',
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
];

const QUALITY_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
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

const GPT_IMAGE_EDIT_MAX_FILES = 16;
const GPT_IMAGE_EDIT_MAX_SIZE = 50 * 1024 * 1024;
const DALLE2_IMAGE_EDIT_MAX_SIZE = 4 * 1024 * 1024;

const PLAYGROUND_MODE_OPTIONS = [
  { label: '文生图', value: 'text-to-image' },
  { label: '图生图', value: 'image-to-image' },
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
    delete storedConfig.tokenId;
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

const openImageAssetDB = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(IMAGE_ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_ASSET_STORE_NAME)) {
        db.createObjectStore(IMAGE_ASSET_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const putImageAsset = async (key, value) => {
  const db = await openImageAssetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_ASSET_STORE_NAME, 'readwrite');
    transaction.objectStore(IMAGE_ASSET_STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const getImageAsset = async (key) => {
  const db = await openImageAssetDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_ASSET_STORE_NAME, 'readonly');
    const request = transaction.objectStore(IMAGE_ASSET_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || '');
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const createImageAssetId = () =>
  `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const createImageObjectUrl = async (value) => {
  if (typeof value !== 'string' || !value.startsWith('data:image/')) {
    return value;
  }

  const response = await fetch(value);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  imageObjectUrls.add(objectUrl);
  return objectUrl;
};

const isDalle2Model = (model) => getModelName(model).toLowerCase() === 'dall-e-2';

const isSupportedEditImageFile = (file) =>
  ['image/png', 'image/jpeg', 'image/webp'].includes(file?.type);

const getImageDimensions = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    image.src = objectUrl;
  });

const isBlobImageUrl = (value) =>
  typeof value === 'string' && value.startsWith('blob:');

// 参考图统一经 canvas 解码主图并重新编码，得到“干净”的标准图片，规避上游严格识别报错：
// - 源文件其实是 MPO（手机 3D/动态/景深照片，文件头是 JPEG、含 MPF 多帧段，
//   官方会判为 mpo 并返回 "Unsupported image format: mpo"）；
// - 扩展名/类型与真实内容不符（例如内容是 MPO 却命名为 .png）；
// - 多余的 EXIF/多帧等上游不接受的数据。
// 输出类型沿用原始 png/webp，其余统一转 jpeg；浏览器无法解码时退回原文件。
const reencodeImageFile = (file, outType, ext) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        if (!canvas.width || !canvas.height) {
          reject(new Error('Invalid image size'));
          return;
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to encode image'));
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
            resolve(new File([blob], `${baseName}.${ext}`, { type: outType }));
          },
          outType,
          outType === 'image/jpeg' ? 0.95 : undefined,
        );
      } catch (err) {
        reject(err);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    image.src = objectUrl;
  });

const normalizeEditImageFile = async (file) => {
  let outType = 'image/jpeg';
  let ext = 'jpg';
  if (file?.type === 'image/png') {
    outType = 'image/png';
    ext = 'png';
  } else if (file?.type === 'image/webp') {
    outType = 'image/webp';
    ext = 'webp';
  }
  try {
    return await reencodeImageFile(file, outType, ext);
  } catch (err) {
    return file; // 解码失败则退回原文件，交给后续校验/上游处理
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

const normalizeMessageContent = (content) => {
  if (!Array.isArray(content)) return content;

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      if (item.type === 'image_url') {
        const imageUrl = item.image_url?.url || item.url || '';
        const shouldDropStaleBlob = isBlobImageUrl(imageUrl);
        if (!imageUrl && !item.image_asset_id) return null;
        return {
          ...item,
          image_url: {
            ...(item.image_url || {}),
            url: shouldDropStaleBlob ? '' : imageUrl,
          },
        };
      }

      if (
        item.url ||
        item.b64_json ||
        item.image_url?.url ||
        item.image_asset_id
      ) {
        return {
          type: 'image_url',
          image_url: {
            url:
              item.image_url?.url ||
              item.url ||
              (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
          },
          image_asset_id: item.image_asset_id,
        };
      }

      return item;
    })
    .filter(Boolean);
};

const normalizeStoredMessage = (message) => {
  if (!message || typeof message !== 'object') return null;
  return {
    id: message.id || createMessageId(),
    role: message.role,
    content: normalizeMessageContent(message.content),
    createAt: message.createAt || Date.now(),
    status: message.status,
    model: message.model,
    requestPayload: message.requestPayload,
    reasoningContent: message.reasoningContent,
    isReasoningExpanded: message.isReasoningExpanded,
    isThinkingComplete: message.isThinkingComplete,
    hasAutoCollapsed: message.hasAutoCollapsed,
    response: message.response,
    taskId: message.taskId,
  };
};

const compactMessageContent = async (content) => {
  if (!Array.isArray(content)) return content;
  const compacted = [];

  for (const item of content) {
    if (!item || typeof item !== 'object') continue;

    const imageUrl = item.image_url?.url || item.url || '';
    if (imageUrl) {
      if (isBlobImageUrl(imageUrl)) {
        if (!item.image_asset_id) {
          compacted.push({
            ...item,
            url: item.url ? '' : undefined,
            image_url: item.image_url
              ? { ...item.image_url, url: '' }
              : undefined,
          });
          continue;
        }

        compacted.push({
          ...item,
          url: item.url ? '' : undefined,
          image_url: item.image_url
            ? { ...item.image_url, url: '' }
            : undefined,
        });
        continue;
      }

      if (isLargeInlineImage(imageUrl)) {
        const assetId = item.image_asset_id || createImageAssetId();
        try {
          await putImageAsset(assetId, imageUrl);
          compacted.push({
            ...item,
            image_asset_id: assetId,
            url: item.url ? '' : undefined,
            image_url: item.image_url
              ? { ...item.image_url, url: '' }
              : undefined,
          });
          continue;
        } catch (assetError) {
          console.warn('Failed to store image asset:', assetError);
        }
      }
      compacted.push(item);
      continue;
    }

    if (item.b64_json) {
      const assetId = item.image_asset_id || createImageAssetId();
      try {
        await putImageAsset(assetId, `data:image/png;base64,${item.b64_json}`);
        compacted.push({
          ...item,
          image_asset_id: assetId,
          b64_json: '',
        });
        continue;
      } catch (assetError) {
        console.warn('Failed to store image asset:', assetError);
      }
    }

    compacted.push(item);
  }

  return compacted.filter(Boolean);
};

const serializeMessages = async (messages) => {
  const serialized = [];

  for (const message of messages) {
    const normalized = normalizeStoredMessage(message);
    if (!normalized) continue;

    const storedMessage = {
      ...normalized,
      response: undefined,
      content: await compactMessageContent(normalized.content),
    };
    serialized.push(storedMessage);
  }

  return {
    messages: serialized,
    timestamp: new Date().toISOString(),
  };
};

const hydrateMessageContent = async (content) => {
  if (!Array.isArray(content)) return { content, changed: false };

  let changed = false;
  const hydrated = await Promise.all(
    content.map(async (item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }

      const currentImageUrl = item.image_url?.url || item.url || '';
      if (isBlobImageUrl(currentImageUrl)) {
        if (!item.image_asset_id) {
          changed = true;
          if (item.image_url) {
            return {
              ...item,
              image_url: {
                ...item.image_url,
                url: '',
              },
            };
          }
          return {
            ...item,
            url: '',
          };
        }
      }

      if (isLargeInlineImage(currentImageUrl)) {
        try {
          const assetId = item.image_asset_id || createImageAssetId();
          if (!item.image_asset_id) {
            await putImageAsset(assetId, currentImageUrl);
          }
          const objectUrl = await createImageObjectUrl(currentImageUrl);
          if (objectUrl && objectUrl !== currentImageUrl) {
            changed = true;
            if (item.image_url) {
              return {
                ...item,
                image_asset_id: assetId,
                image_url: {
                  ...item.image_url,
                  url: objectUrl,
                },
              };
            }
            return {
              ...item,
              image_asset_id: assetId,
              url: objectUrl,
            };
          }
        } catch (assetError) {
          console.warn('Failed to create image object URL:', assetError);
          return item;
        }
      }

      if (!item.image_asset_id) {
        return item;
      }

      const hasImageUrl = Boolean(
        (currentImageUrl && !isBlobImageUrl(currentImageUrl)) || item.b64_json,
      );
      if (hasImageUrl) return item;

      try {
        const asset = await getImageAsset(item.image_asset_id);
        if (!asset) return item;
        const displayUrl = await createImageObjectUrl(asset);
        changed = true;
        if (item.image_url) {
          return {
            ...item,
            image_url: {
              ...item.image_url,
              url: displayUrl,
            },
          };
        }
        return {
          ...item,
          url: displayUrl,
        };
      } catch (assetError) {
        console.warn('Failed to load image asset:', assetError);
        return item;
      }
    }),
  );

  return { content: hydrated, changed };
};

const hydrateStoredMessages = async (storedMessages) => {
  let changed = false;
  const hydrated = await Promise.all(
    storedMessages.map(async (message) => {
      const result = await hydrateMessageContent(message.content);
      changed = changed || result.changed;
      return {
        ...message,
        content: result.content,
      };
    }),
  );

  return { messages: hydrated, changed };
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

const extractImageItems = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return typeof payload === 'object' ? [payload] : [];
};

const toImageUrl = (item) => {
  if (!item || typeof item !== 'object') return '';
  if (item.image_url?.url) return item.image_url.url;
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  return '';
};

// OpenAI 的 gpt-image 家族（gpt-image-1 / gpt-image-2 / gpt-image-1.5 等）固定返回
// b64_json，不接受 response_format 参数，带上会被官方拒绝（Unknown parameter:
// 'response_format'.）。dall-e 系列则支持，因此仅对 gpt-image 前缀剥离。
const modelRejectsResponseFormat = (model) =>
  typeof model === 'string' &&
  model.trim().toLowerCase().startsWith('gpt-image');

const isGeneratingStatus = (status) =>
  status === 'loading' ||
  status === 'incomplete' ||
  status === 'queued' ||
  status === 'processing';

const isImageTaskPending = (message) =>
  Boolean(message?.taskId) && isGeneratingStatus(message.status);

const isImageTaskFinished = (status) =>
  ['SUCCESS', 'succeeded', 'completed'].includes(String(status || ''));

const isImageTaskFailed = (status) =>
  ['FAILURE', 'failed', 'error'].includes(String(status || ''));

const isLargeInlineImage = (value) =>
  typeof value === 'string' &&
  (value.startsWith('data:image/') || value.length > 200000);

const imageItemsToMessageContent = (items, t) => {
  const normalizedItems = extractImageItems(items);
  if (normalizedItems.length === 0) {
    return t('响应中没有图片数据');
  }

  const imageParts = normalizedItems
    .map((item) => {
      const imageUrl = toImageUrl(item);
      if (!imageUrl) return null;
      return {
        type: 'image_url',
        image_url: { url: imageUrl },
      };
    })
    .filter(Boolean);

  return imageParts.length > 0 ? imageParts : t('响应中没有图片数据');
};

const getMessageCopyText = (message) => {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';

  return message.content
    .map((item) => {
      if (item?.type === 'text') return item.text;
      if (item?.type === 'image_url') return item.image_url?.url;
      return item?.url || item?.b64_json || '';
    })
    .filter(Boolean)
    .join('\n');
};

const appendFormField = (formData, key, value) => {
  if (value === undefined || value === null || value === '') return;
  formData.append(key, String(value));
};

const getRequestErrorMessage = (error, t) =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.message ||
  t('请求发生错误');

const generateAvatarDataUrl = (username) => {
  if (!username) {
    return 'https://lf3-static.bytednsdoc.com/obj/eden-cn/ptlz_zlp/ljhwZthlaukjlkulzlp/docs-icon.png';
  }
  const firstLetter = username[0].toUpperCase();
  const bgColor = stringToColor(username);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="16" fill="${bgColor}" />
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="16" fill="#ffffff" font-family="sans-serif">${firstLetter}</text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${encodeToBase64(svg)}`;
};

const ImagePlayground = () => {
  const { t } = useTranslation();
  const [userState] = useContext(UserContext);
  const isMobile = useIsMobile();
  const actualTheme = useActualTheme();
  const logo = useMemo(() => getLogo(), [actualTheme]);
  const styleState = useMemo(() => ({ isMobile }), [isMobile]);
  const [config, setConfig] = useState(loadStoredConfig);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState(() =>
    loadStoredMessages().map(normalizeStoredMessage).filter(Boolean),
  );
  const [error, setError] = useState('');
  const [activeDebugTab, setActiveDebugTab] = useState('preview');
  const [lastRequestPayload, setLastRequestPayload] = useState(null);
  const [lastRequestTime, setLastRequestTime] = useState(null);
  const [previewTimestamp, setPreviewTimestamp] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const [referenceImagePreviews, setReferenceImagePreviews] = useState([]);
  const referenceImageInputRef = useRef(null);
  const messagesRef = useRef(messages);
  const persistSequenceRef = useRef(0);

  const roleInfo = useMemo(
    () => ({
      user: {
        name: userState?.user?.username || 'User',
        avatar: generateAvatarDataUrl(userState?.user?.username),
      },
      assistant: {
        name: 'Assistant',
        avatar: logo,
      },
      system: {
        name: 'System',
        avatar: logo,
      },
    }),
    [logo, userState?.user?.username],
  );

  useEffect(
    () => () => {
      imageObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      imageObjectUrls.clear();
    },
    [],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (storageError) {
      console.warn('Failed to save image playground config:', storageError);
    }
  }, [config]);

  useEffect(() => {
    const previews = referenceImages.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setReferenceImagePreviews(previews);
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [referenceImages]);

  const persistMessages = useCallback(async (nextMessages) => {
    const sequence = persistSequenceRef.current + 1;
    persistSequenceRef.current = sequence;

    try {
      const payload = await serializeMessages(nextMessages);
      if (sequence !== persistSequenceRef.current) return;
      localStorage.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(payload));
    } catch (storageError) {
      console.warn('Failed to save image playground messages:', storageError);
    }
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const commitMessages = useCallback(
    (nextMessages) => {
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      void persistMessages(nextMessages);
    },
    [persistMessages],
  );

  useEffect(() => {
    let cancelled = false;
    hydrateStoredMessages(messagesRef.current).then((result) => {
      if (cancelled || !result.changed) return;
      const hydratedById = new Map(
        result.messages.map((message) => [message.id, message]),
      );
      const mergedMessages = messagesRef.current.map((message) => {
        const hydratedMessage = hydratedById.get(message.id);
        return hydratedMessage
          ? { ...message, content: hydratedMessage.content }
          : message;
      });
      messagesRef.current = mergedMessages;
      setMessages(mergedMessages);
      void persistMessages(mergedMessages);
    });
    return () => {
      cancelled = true;
    };
  }, [persistMessages]);

  useEffect(() => {
    const hasInterruptedMessage = messagesRef.current.some((message) =>
      isGeneratingStatus(message.status) && !message.taskId,
    );
    if (!hasInterruptedMessage) return;

    const fixedMessages = messagesRef.current.map((message) =>
      isGeneratingStatus(message.status) && !message.taskId
        ? {
            ...message,
            status: 'error',
            content: t('请求已中断，请重新生成'),
          }
        : message,
    );
    commitMessages(fixedMessages);
  }, [commitMessages, t]);

  useEffect(() => {
    let mounted = true;
    const loadGroups = async () => {
      if (!userState?.user) return;
      setLoadingGroups(true);
      try {
        const res = await API.get('/api/user/self/groups', {
          disableDuplicate: true,
          skipErrorHandler: true,
        });
        const { success, message, data } = res.data || {};
        if (!mounted) return;
        if (!success) {
          Toast.warning(message || t('加载分组失败'));
          return;
        }

        const userGroup =
          userState?.user?.group ||
          JSON.parse(localStorage.getItem('user') || '{}')?.group;
        const groupOptions = processGroupsData(data || {}, userGroup);
        setGroups(groupOptions);
        setConfig((prev) => {
          const hasCurrentGroup = groupOptions.some(
            (option) => option.value === prev.group,
          );
          const nextGroup = hasCurrentGroup
            ? prev.group
            : groupOptions[0]?.value || '';
          if (nextGroup === prev.group) return prev;
          return { ...prev, group: nextGroup, model: '' };
        });
      } catch (groupError) {
        if (mounted) {
          setGroups([]);
          Toast.warning(groupError.message || t('加载分组失败'));
        }
      } finally {
        if (mounted) setLoadingGroups(false);
      }
    };
    loadGroups();
    return () => {
      mounted = false;
    };
  }, [t, userState?.user]);

  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      if (!config.group) {
        setModels([]);
        setConfig((prev) => (prev.model ? { ...prev, model: '' } : prev));
        return;
      }
      setModels([]);
      setConfig((prev) => (prev.model ? { ...prev, model: '' } : prev));
      setLoadingModels(true);
      try {
        const res = await API.get('/api/user/models', {
          params: config.group ? { group: config.group } : undefined,
          disableDuplicate: true,
          skipErrorHandler: true,
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
  }, [config.group, t]);

  const requestPayload = useMemo(() => {
    const payload = {
      group: config.group,
      model: config.model.trim(),
      prompt: config.prompt,
      n: 1,
    };

    if (config.size) payload.size = config.size;
    if (config.quality) payload.quality = config.quality;
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

  const isImageEditMode = config.playgroundMode === 'image-to-image';

  // gpt-image 系列不接受 response_format，转发给上游会被官方拒绝，这里直接不下发。
  const dropResponseFormat = modelRejectsResponseFormat(config.model);

  const imageEditRequestPayload = useMemo(() => ({
    ...requestPayload,
    ...(dropResponseFormat ? {} : { response_format: 'b64_json' }),
    output_format: requestPayload.output_format || 'png',
  }), [requestPayload, dropResponseFormat]);

  const requestPreviewPayload = useMemo(() => {
    if (!isImageEditMode) {
      return {
        ...requestPayload,
        async: true,
        stream: false,
        ...(dropResponseFormat ? {} : { response_format: 'b64_json' }),
        endpoint: '/pg/images/generations',
      };
    }

    return {
      ...imageEditRequestPayload,
      async: true,
      stream: false,
      endpoint: '/pg/images/edits',
      image: referenceImages.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })),
    };
  }, [imageEditRequestPayload, isImageEditMode, referenceImages, requestPayload, dropResponseFormat]);

  const updateConfig = useCallback((field, value) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'group' ? { model: '' } : {}),
    }));
  }, []);

  const showFixedParamHint = useCallback(
    (message) => {
      Toast.info(t(message));
    },
    [t],
  );

  const updateMessage = useCallback((messageId, patch) => {
    const nextMessages = messagesRef.current.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message,
    );
    commitMessages(nextMessages);
  }, [commitMessages]);

  const pollImageTask = useCallback(
    async (messageId, taskId) => {
      if (!taskId) return;
      let stopped = false;
      while (!stopped) {
        try {
          const res = await API.get(`/api/task/image/${taskId}`, {
            disableDuplicate: true,
            skipErrorHandler: true,
          });
          const payload = res.data || {};
          if (!payload.success) {
            throw new Error(payload.message || t('获取任务状态失败'));
          }
          const task = payload.data || {};
          if (isImageTaskFinished(task.status)) {
            const imagePayload = {
              data: Array.isArray(task.data) ? task.data : [],
              task_id: task.task_id,
              status: task.status,
            };
            updateMessage(messageId, {
              status: 'complete',
              content: imageItemsToMessageContent(imagePayload, t),
              response: imagePayload,
            });
            stopped = true;
            Toast.success(t('生成成功'));
            break;
          }
          if (isImageTaskFailed(task.status)) {
            throw new Error(task.error || t('生成失败'));
          }
          updateMessage(messageId, {
            status: 'processing',
            content: `${t('生成中')}～`,
            response: task,
          });
        } catch (taskError) {
          const message = taskError.message || t('获取任务状态失败');
          updateMessage(messageId, {
            status: 'error',
            content: message,
          });
          Toast.error(message);
          stopped = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 8000));
      }
    },
    [t, updateMessage],
  );

  useEffect(() => {
    const pendingTasks = messagesRef.current.filter(isImageTaskPending);
    pendingTasks.forEach((message) => {
      void pollImageTask(message.id, message.taskId);
    });
  }, [pollImageTask]);

  const handleReferenceImageChange = useCallback(
    async (event) => {
      const selectedFiles = Array.from(event.target.files || []);
      event.target.value = '';
      if (selectedFiles.length === 0) return;

      // 上传前统一规整：把 MPO / 类型与内容不符 / 含多帧的图片重编码为干净标准图，
      // 避免官方返回 "Unsupported image format: mpo" 之类的 400。
      const normalizedSelected = [];
      for (const original of selectedFiles) {
        normalizedSelected.push(await normalizeEditImageFile(original));
      }

      const dalle2 = isDalle2Model(config.model);
      const nextFiles = dalle2
        ? normalizedSelected.slice(0, 1)
        : [...referenceImages, ...normalizedSelected].slice(
            0,
            GPT_IMAGE_EDIT_MAX_FILES,
          );

      if (!dalle2 && referenceImages.length + selectedFiles.length > GPT_IMAGE_EDIT_MAX_FILES) {
        Toast.warning(t('最多上传 16 张参考图'));
      }

      const validFiles = [];
      for (const file of nextFiles) {
        if (!isSupportedEditImageFile(file)) {
          Toast.error(t('参考图仅支持 png、webp、jpg'));
          continue;
        }

        if (dalle2) {
          if (file.type !== 'image/png') {
            Toast.error(t('dall-e-2 仅支持单张 PNG 参考图'));
            continue;
          }
          if (file.size > DALLE2_IMAGE_EDIT_MAX_SIZE) {
            Toast.error(t('dall-e-2 参考图需小于 4MB'));
            continue;
          }
          try {
            const { width, height } = await getImageDimensions(file);
            if (width !== height) {
              Toast.error(t('dall-e-2 参考图必须为正方形 PNG'));
              continue;
            }
          } catch (imageError) {
            Toast.error(t('无法读取参考图尺寸'));
            continue;
          }
        } else if (file.size > GPT_IMAGE_EDIT_MAX_SIZE) {
          Toast.error(t('每张参考图需小于 50MB'));
          continue;
        }

        validFiles.push(file);
      }

      setReferenceImages(dalle2 ? validFiles.slice(0, 1) : validFiles);
    },
    [config.model, referenceImages, t],
  );

  const clearReferenceImage = useCallback(() => {
    setReferenceImages([]);
    if (referenceImageInputRef.current) {
      referenceImageInputRef.current.value = '';
    }
  }, []);

  const removeReferenceImage = useCallback((index) => {
    setReferenceImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const submit = useCallback(async () => {
    if (!requestPayload.group) {
      Toast.error(t('请先选择分组'));
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
    if (isImageEditMode && referenceImages.length === 0) {
      Toast.error(t('请先上传参考图'));
      return;
    }

    const promptText = requestPayload.prompt.trim();
    const userMessage = createDialogMessage('user', promptText);
    const assistantMessage = createDialogMessage('assistant', '', {
      status: 'loading',
      model: requestPayload.model,
      requestPayload: requestPreviewPayload,
    });

    commitMessages([...messagesRef.current, userMessage, assistantMessage]);
    setConfig((prev) => ({ ...prev, prompt: '' }));
    setSubmitting(true);
    setError('');
    setLastRequestPayload(requestPreviewPayload);
    setLastRequestTime(new Date().toISOString());

    try {
      const endpoint = isImageEditMode ? '/pg/images/edits' : '/pg/images/generations';
      const body = isImageEditMode
        ? new FormData()
        : {
            ...requestPayload,
            async: true,
            stream: false,
            ...(dropResponseFormat ? {} : { response_format: 'b64_json' }),
          };

      if (isImageEditMode) {
        appendFormField(body, 'group', imageEditRequestPayload.group);
        appendFormField(body, 'model', imageEditRequestPayload.model);
        appendFormField(body, 'prompt', imageEditRequestPayload.prompt);
        appendFormField(body, 'n', imageEditRequestPayload.n);
        appendFormField(body, 'size', imageEditRequestPayload.size);
        appendFormField(body, 'quality', imageEditRequestPayload.quality);
        if (!dropResponseFormat) {
          appendFormField(body, 'response_format', imageEditRequestPayload.response_format);
        }
        appendFormField(body, 'background', imageEditRequestPayload.background);
        appendFormField(body, 'output_format', imageEditRequestPayload.output_format);
        appendFormField(body, 'output_compression', imageEditRequestPayload.output_compression);
        appendFormField(body, 'moderation', imageEditRequestPayload.moderation);
        appendFormField(body, 'async', true);
        appendFormField(body, 'stream', false);
        referenceImages.forEach((file) => {
          body.append('image', file, file.name);
        });
      }

      const res = await API.post(endpoint, body, {
        skipErrorHandler: true,
        headers: isImageEditMode ? {} : { 'Content-Type': 'application/json' },
      });
      const data = res.data || {};
      if (data?.task_id) {
        updateMessage(assistantMessage.id, {
          status: 'queued',
          content: `${t('任务已提交')}：${data.task_id}`,
          response: data,
          taskId: data.task_id,
        });
        Toast.success(t('任务已提交'));
        void pollImageTask(assistantMessage.id, data.task_id);
        return;
      }
      updateMessage(assistantMessage.id, {
        status: 'complete',
        content: imageItemsToMessageContent(data, t),
        response: data,
      });
      Toast.success(t('生成成功'));
    } catch (submitError) {
      const message = getRequestErrorMessage(submitError, t);
      setError(message);
      updateMessage(assistantMessage.id, {
        status: 'error',
        content: message,
      });
      Toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    imageEditRequestPayload,
    isImageEditMode,
    referenceImages,
    requestPayload,
    requestPreviewPayload,
    dropResponseFormat,
    pollImageTask,
    t,
    updateMessage,
  ]);

  const reset = useCallback(() => {
    setConfig((prev) => ({
      ...DEFAULT_CONFIG,
      group: prev.group,
      model: prev.model,
    }));
    setError('');
    clearReferenceImage();
  }, [clearReferenceImage]);

  const clearMessages = useCallback(() => {
    commitMessages([]);
    setError('');
  }, [commitMessages]);

  const payloadPreview = useMemo(
    () => JSON.stringify(requestPreviewPayload, null, 2),
    [requestPreviewPayload],
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

  const renderCustomChatContent = useCallback(
    ({ message, className }) => (
      <OptimizedMessageContent
        message={message}
        className={className}
        styleState={styleState}
        onToggleReasoningExpansion={() => {}}
      />
    ),
    [styleState],
  );

  const handleMessageCopy = useCallback(
    async (targetMessage) => {
      const text = getMessageCopyText(targetMessage);
      if (!text) return;
      const ok = await copy(text);
      if (ok) Toast.success(t('已复制'));
    },
    [t],
  );

  const handleMessageDelete = useCallback(
    (targetMessage) => {
      commitMessages(
        messagesRef.current.filter((message) => message.id !== targetMessage.id),
      );
    },
    [commitMessages],
  );

  const renderChatBoxAction = useCallback(
    ({ message }) => {
      const isAnyMessageGenerating = messagesRef.current.some(
        (item) => isGeneratingStatus(item.status),
      );

      return (
        <OptimizedMessageActions
          message={message}
          styleState={styleState}
          onMessageCopy={handleMessageCopy}
          onMessageDelete={handleMessageDelete}
          isAnyMessageGenerating={isAnyMessageGenerating}
        />
      );
    },
    [handleMessageCopy, handleMessageDelete, styleState],
  );

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
                  <Users size={14} style={{ color: 'var(--hp-sub)' }} />
                  <Text strong className='text-sm'>
                    {t('分组')}
                  </Text>
                </div>
                <FieldHint>{t('选择分组后自动加载该分组可用的生图模型')}</FieldHint>
                <Select
                  value={config.group}
                  filter={selectFilter}
                  loading={loadingGroups}
                  autoClearSearchValue={false}
                  optionList={groups}
                  placeholder={t('请选择分组')}
                  emptyContent={t('暂无可用分组')}
                  disabled={loadingGroups}
                  onChange={(value) => updateConfig('group', value)}
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
                <FieldHint>{t('模型会根据当前分组自动选择，也可在该分组模型内切换')}</FieldHint>
                <Select
                  value={config.model}
                  filter={selectFilter}
                  loading={loadingModels}
                  autoClearSearchValue={false}
                  optionList={models}
                  placeholder={t('请选择模型')}
                  emptyContent={t('暂无可用生图模型')}
                  disabled={loadingModels || !config.group}
                  onChange={(value) => updateConfig('model', value)}
                  style={{ width: '100%' }}
                  getPopupContainer={() => document.body}
                />
              </div>

              <div>
                <div className='flex items-center gap-2 mb-2'>
                  <ImagePlus size={14} style={{ color: 'var(--hp-sub)' }} />
                  <Text strong className='text-sm'>
                    {t('模式')}
                  </Text>
                </div>
                <FieldHint>{t('文生图和图生图之间切换')}</FieldHint>
                <Radio.Group
                  type='button'
                  value={config.playgroundMode}
                  onChange={(val) => {
                    const nextMode = val && val.target ? val.target.value : val;
                    updateConfig('playgroundMode', nextMode);
                  }}
                >
                  {PLAYGROUND_MODE_OPTIONS.map((option) => (
                    <Radio key={option.value} value={option.value}>
                      {t(option.label)}
                    </Radio>
                  ))}
                </Radio.Group>
              </div>

              {isImageEditMode && (
                <div>
                  <div className='flex items-center justify-between gap-3 mb-2'>
                    <div className='flex items-center gap-2 min-w-0'>
                      <Upload size={14} style={{ color: 'var(--hp-sub)' }} />
                      <Text strong className='text-sm'>
                        {t('参考图')}
                      </Text>
                    </div>
                    <Button
                      size='small'
                      icon={<Upload size={14} />}
                      onClick={() => referenceImageInputRef.current?.click()}
                    >
                      {referenceImages.length > 0 ? t('继续添加') : t('上传参考图')}
                    </Button>
                  </div>
                  <FieldHint>{t('GPT 图片模型最多 16 张，每张小于 50MB；dall-e-2 仅单张正方形 PNG')}</FieldHint>
                  <input
                    ref={referenceImageInputRef}
                    type='file'
                    accept='image/*'
                    multiple={!isDalle2Model(config.model)}
                    hidden
                    onChange={handleReferenceImageChange}
                  />
                  {referenceImagePreviews.length > 0 ? (
                    <div className='space-y-2'>
                      {referenceImagePreviews.map((preview, index) => (
                        <div
                          key={`${preview.file.name}-${preview.file.size}-${index}`}
                          className='flex items-center gap-3 rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] p-3'
                        >
                          <img
                            src={preview.url}
                            alt={preview.file.name}
                            className='h-16 w-16 flex-shrink-0 rounded-md object-cover'
                          />
                          <div className='min-w-0 flex-1'>
                            <Text strong className='block truncate text-sm'>
                              {preview.file.name}
                            </Text>
                            <Text type='tertiary' size='small' className='block'>
                              {Math.max(1, Math.round(preview.file.size / 1024))} KB
                            </Text>
                          </div>
                          <Button
                            size='small'
                            theme='borderless'
                            type='tertiary'
                            icon={<Trash2 size={14} />}
                            onClick={() => removeReferenceImage(index)}
                            title={t('移除参考图')}
                          />
                        </div>
                      ))}
                      <Button
                        size='small'
                        theme='borderless'
                        type='tertiary'
                        icon={<Trash2 size={14} />}
                        onClick={clearReferenceImage}
                      >
                        {t('清空参考图')}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type='button'
                      className='flex w-full items-center justify-center rounded-lg border border-dashed border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] px-4 py-5 text-sm text-[var(--semi-color-text-2)] transition-colors hover:border-[var(--hp-accent)] hover:text-[var(--hp-accent)]'
                      onClick={() => referenceImageInputRef.current?.click()}
                    >
                      {t('上传参考图')}
                    </button>
                  )}
                </div>
              )}

              <div className='space-y-3'>
                <div>
                  <Text className='mb-2 block text-sm font-medium'>
                    {t('图片数量')}
                  </Text>
                  <FieldHint>{t('后端当前固定支持单张，随请求固定传 1')}</FieldHint>
                  <InputNumber
                    min={1}
                    max={1}
                    step={1}
                    value={1}
                    onFocus={() =>
                      showFixedParamHint('后端当前固定支持单张，图片数量固定为 1')
                    }
                    onChange={() =>
                      showFixedParamHint('后端当前固定支持单张，图片数量固定为 1')
                    }
                    style={{ width: '100%' }}
                  />
                </div>
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

              <div className='flex-1 min-h-0 overflow-hidden'>
                {messages.length > 0 ? (
                  <Chat
                    chats={messages}
                    roleConfig={roleInfo}
                    chatBoxRenderConfig={{
                      renderChatBoxContent: renderCustomChatContent,
                      renderChatBoxAction,
                      renderChatBoxTitle: () => null,
                    }}
                    renderInputArea={() => null}
                    style={{
                      height: '100%',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      background: 'var(--hp-card)',
                    }}
                    className='h-full'
                  />
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
                    placeholder={
                      isImageEditMode
                        ? t('描述你想如何修改这张图片')
                        : t('描述你想生成的图片')
                    }
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
