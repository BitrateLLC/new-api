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

import React, { useState, useMemo, useCallback } from 'react';
import {
  Button,
  Tooltip,
  Toast,
  Collapse,
  Badge,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { copy } from '../../helpers';

const SSEViewer = ({ sseData }) => {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [copied, setCopied] = useState(false);

  const parsedSSEData = useMemo(() => {
    if (!sseData || !Array.isArray(sseData)) return [];
    return sseData.map((item, index) => {
      let parsed = null;
      let error = null;
      let isDone = false;
      if (item === '[DONE]') {
        isDone = true;
      } else {
        try {
          parsed = typeof item === 'string' ? JSON.parse(item) : item;
        } catch (e) {
          error = e.message;
        }
      }
      return { index, raw: item, parsed, error, isDone, key: `sse-${index}` };
    });
  }, [sseData]);

  const stats = useMemo(() => {
    const total = parsedSSEData.length;
    const errors = parsedSSEData.filter((i) => i.error).length;
    const done = parsedSSEData.filter((i) => i.isDone).length;
    const valid = total - errors - done;
    return { total, errors, done, valid };
  }, [parsedSSEData]);

  const handleToggleAll = useCallback(() => {
    setExpandedKeys((prev) =>
      prev.length === parsedSSEData.length
        ? []
        : parsedSSEData.map((i) => i.key),
    );
  }, [parsedSSEData]);

  const handleCopyAll = useCallback(async () => {
    try {
      const allData = parsedSSEData
        .map((item) =>
          item.parsed ? JSON.stringify(item.parsed, null, 2) : item.raw,
        )
        .join('\n\n');
      await copy(allData);
      setCopied(true);
      Toast.success(t('已复制全部数据'));
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      Toast.error(t('复制失败'));
    }
  }, [parsedSSEData, t]);

  const handleCopySingle = useCallback(
    async (item) => {
      try {
        const textToCopy = item.parsed
          ? JSON.stringify(item.parsed, null, 2)
          : item.raw;
        await copy(textToCopy);
        Toast.success(t('已复制'));
      } catch {
        Toast.error(t('复制失败'));
      }
    },
    [t],
  );

  const renderSSEItem = (item) => {
    if (item.isDone) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--hp-bg-soft)',
            borderRadius: '12px',
            border: '1px solid var(--hp-border)',
            transition: 'all 0.2s ease',
          }}
        >
          <CheckCircle size={15} style={{ color: 'var(--hp-success, #22c55e)', flexShrink: 0 }} />
          <Typography.Text style={{ color: 'var(--hp-success, #22c55e)', fontWeight: 500, fontSize: '13px' }}>
            {t('流式响应完成')} [DONE]
          </Typography.Text>
        </div>
      );
    }

    if (item.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: 'var(--hp-bg-soft)',
              borderRadius: '12px',
              border: '1px solid var(--hp-border)',
              transition: 'all 0.2s ease',
            }}
          >
            <XCircle size={15} style={{ color: 'var(--hp-danger, #ef4444)', flexShrink: 0 }} />
            <Typography.Text style={{ color: 'var(--hp-danger, #ef4444)', fontSize: '13px' }}>
              {t('解析错误')}: {item.error}
            </Typography.Text>
          </div>
          <pre
            style={{
              padding: '12px 14px',
              background: 'var(--hp-bg-soft)',
              borderRadius: '12px',
              border: '1px solid var(--hp-border)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '12px',
              color: 'var(--hp-text)',
              overflowX: 'auto',
              margin: 0,
              transition: 'all 0.2s ease',
            }}
          >
            {item.raw}
          </pre>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* JSON block */}
        <div style={{ position: 'relative' }}>
          <pre
            style={{
              padding: '14px 16px',
              background: 'var(--hp-bg-soft)',
              borderRadius: '12px',
              border: '1px solid var(--hp-border)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '12px',
              color: 'var(--hp-text)',
              overflowX: 'auto',
              lineHeight: '1.6',
              margin: 0,
              transition: 'all 0.2s ease',
            }}
          >
            {JSON.stringify(item.parsed, null, 2)}
          </pre>
          <Button
            icon={<Copy size={12} />}
            size='small'
            theme='borderless'
            onClick={() => handleCopySingle(item)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              transition: 'all 0.2s ease',
            }}
          />
        </div>

        {/* Key info badges */}
        {item.parsed?.choices?.[0] && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {item.parsed.choices[0].delta?.content && (
              <Badge
                count={`${t('内容')}: "${String(item.parsed.choices[0].delta.content).substring(0, 20)}..."`}
                type='primary'
              />
            )}
            {item.parsed.choices[0].delta?.reasoning_content && (
              <Badge count={t('有 Reasoning')} type='warning' />
            )}
            {item.parsed.choices[0].finish_reason && (
              <Badge
                count={`${t('完成')}: ${item.parsed.choices[0].finish_reason}`}
                type='success'
              />
            )}
            {item.parsed.usage && (
              <Badge
                count={`${t('令牌')}: ${item.parsed.usage.prompt_tokens || 0}/${item.parsed.usage.completion_tokens || 0}`}
                type='tertiary'
              />
            )}
          </div>
        )}
      </div>
    );
  };

  if (!parsedSSEData || parsedSSEData.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          color: 'var(--hp-sub)',
          fontSize: '14px',
        }}
      >
        {t('暂无SSE响应数据')}
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--hp-bg-soft)',
        borderRadius: '12px',
        border: '1px solid var(--hp-border)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--hp-border)',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Zap size={15} style={{ color: 'var(--hp-sub)' }} />
          <Typography.Text strong style={{ fontSize: '13px', color: 'var(--hp-text)' }}>
            {t('SSE数据流')}
          </Typography.Text>
          <Badge count={stats.total} type='primary' />
          {stats.errors > 0 && (
            <Badge count={`${stats.errors} ${t('错误')}`} type='danger' />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tooltip content={t('复制全部')}>
            <Button
              icon={<Copy size={13} />}
              size='small'
              onClick={handleCopyAll}
              theme='borderless'
              style={{ transition: 'all 0.2s ease' }}
            >
              {copied ? t('已复制') : t('复制全部')}
            </Button>
          </Tooltip>
          <Tooltip
            content={
              expandedKeys.length === parsedSSEData.length
                ? t('全部收起')
                : t('全部展开')
            }
          >
            <Button
              icon={
                expandedKeys.length === parsedSSEData.length ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )
              }
              size='small'
              onClick={handleToggleAll}
              theme='borderless'
              style={{ transition: 'all 0.2s ease' }}
            >
              {expandedKeys.length === parsedSSEData.length
                ? t('收起')
                : t('展开')}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* SSE list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--hp-border) transparent',
        }}
      >
        <Collapse
          activeKey={expandedKeys}
          onChange={setExpandedKeys}
          accordion={false}
          style={{
            background: 'transparent',
            borderRadius: '12px',
            border: '1px solid var(--hp-border)',
            overflow: 'hidden',
          }}
        >
          {parsedSSEData.map((item) => (
            <Collapse.Panel
              key={item.key}
              style={{ transition: 'all 0.2s ease' }}
              header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Badge count={`#${item.index + 1}`} type='tertiary' />
                  {item.isDone ? (
                    <span style={{ color: 'var(--hp-success, #22c55e)', fontWeight: 500, fontSize: '13px' }}>
                      [DONE]
                    </span>
                  ) : item.error ? (
                    <span style={{ color: 'var(--hp-danger, #ef4444)', fontSize: '13px' }}>
                      {t('解析错误')}
                    </span>
                  ) : (
                    <>
                      <span style={{ color: 'var(--hp-text)', fontSize: '13px' }}>
                        {item.parsed?.id || item.parsed?.object || t('SSE 事件')}
                      </span>
                      {item.parsed?.choices?.[0]?.delta && (
                        <span style={{ fontSize: '11px', color: 'var(--hp-sub)' }}>
                          •{' '}
                          {Object.keys(item.parsed.choices[0].delta)
                            .filter((k) => item.parsed.choices[0].delta[k])
                            .join(', ')}
                        </span>
                      )}
                    </>
                  )}
                </div>
              }
            >
              {renderSSEItem(item)}
            </Collapse.Panel>
          ))}
        </Collapse>
      </div>
    </div>
  );
};

export default SSEViewer;
