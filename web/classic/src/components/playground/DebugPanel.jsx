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

import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Tabs,
  TabPane,
  Button,
  Dropdown,
} from '@douyinfe/semi-ui';
import { Code, Zap, Clock, X, Eye, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CodeViewer from './CodeViewer';
import SSEViewer from './SSEViewer';

const DebugPanel = ({
  debugData,
  activeDebugTab,
  onActiveDebugTabChange,
  styleState,
  onCloseDebugPanel,
  customRequestMode,
}) => {
  const { t } = useTranslation();

  const [activeKey, setActiveKey] = useState(activeDebugTab);

  useEffect(() => {
    setActiveKey(activeDebugTab);
  }, [activeDebugTab]);

  const handleTabChange = (key) => {
    setActiveKey(key);
    onActiveDebugTabChange(key);
  };

  const renderArrow = (items, pos, handleArrowClick, defaultNode) => {
    const style = {
      width: 32,
      height: 32,
      margin: '0 12px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: '100%',
      background: 'var(--hp-bg-soft)',
      color: 'var(--hp-text)',
      cursor: 'pointer',
    };

    return (
      <Dropdown
        render={
          <Dropdown.Menu>
            {items.map((item) => {
              return (
                <Dropdown.Item
                  key={item.itemKey}
                  onClick={() => handleTabChange(item.itemKey)}
                >
                  {item.tab}
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        }
      >
        {pos === 'start' ? (
          <div style={style} onClick={handleArrowClick}>
            ←
          </div>
        ) : (
          <div style={style} onClick={handleArrowClick}>
            →
          </div>
        )}
      </Dropdown>
    );
  };

  return (
    <Card
      className='h-full flex flex-col'
      bordered={false}
      bodyStyle={{
        padding: styleState.isMobile ? '16px' : '24px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className='flex items-center justify-between mb-6 flex-shrink-0'>
        <div className='flex items-center gap-3'>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(var(--hp-accent-rgb), 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Code size={20} style={{ color: 'var(--hp-accent)' }} />
          </div>
          <Typography.Title heading={5} className='mb-0' style={{ color: 'var(--hp-text)' }}>
            {t('调试信息')}
          </Typography.Title>
        </div>

        {styleState.isMobile && onCloseDebugPanel && (
          <Button
            icon={<X size={16} />}
            onClick={onCloseDebugPanel}
            theme='borderless'
            type='tertiary'
            size='small'
            style={{ borderRadius: '12px', transition: 'all 0.2s ease' }}
          />
        )}
      </div>

      <div className='flex-1 overflow-hidden debug-panel'>
        <Tabs
          renderArrow={renderArrow}
          type='card'
          collapsible
          className='h-full'
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          activeKey={activeKey}
          onChange={handleTabChange}
        >
          <TabPane
            tab={
              <div className='flex items-center gap-2'>
                <Eye size={16} />
                {t('预览请求体')}
                {customRequestMode && (
                  <span
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      background: 'rgba(var(--hp-accent-rgb), 0.12)',
                      color: 'var(--hp-accent)',
                      borderRadius: '20px',
                    }}
                  >
                    自定义
                  </span>
                )}
              </div>
            }
            itemKey='preview'
          >
            <CodeViewer
              content={debugData.previewRequest}
              title='preview'
              language='json'
            />
          </TabPane>

          <TabPane
            tab={
              <div className='flex items-center gap-2'>
                <Send size={16} />
                {t('实际请求体')}
              </div>
            }
            itemKey='request'
          >
            <CodeViewer
              content={debugData.request}
              title='request'
              language='json'
            />
          </TabPane>

          <TabPane
            tab={
              <div className='flex items-center gap-2'>
                <Zap size={16} />
                {t('响应')}
                {debugData.sseMessages && debugData.sseMessages.length > 0 && (
                  <span
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      background: 'var(--semi-color-primary-light-default)',
                      color: 'var(--semi-color-primary)',
                      borderRadius: '20px',
                    }}
                  >
                    SSE ({debugData.sseMessages.length})
                  </span>
                )}
              </div>
            }
            itemKey='response'
          >
            {debugData.sseMessages && debugData.sseMessages.length > 0 ? (
              <SSEViewer sseData={debugData.sseMessages} title='response' />
            ) : (
              <CodeViewer
                content={debugData.response}
                title='response'
                language='json'
              />
            )}
          </TabPane>
        </Tabs>
      </div>

      <div className='flex items-center justify-between mt-4 pt-4 flex-shrink-0'>
        {(debugData.timestamp || debugData.previewTimestamp) && (
          <div className='flex items-center gap-2'>
            <Clock size={14} style={{ color: 'var(--hp-sub)' }} />
            <Typography.Text style={{ fontSize: '12px', color: 'var(--hp-sub)' }}>
              {activeKey === 'preview' && debugData.previewTimestamp
                ? `${t('预览更新')}: ${new Date(debugData.previewTimestamp).toLocaleString()}`
                : debugData.timestamp
                  ? `${t('最后请求')}: ${new Date(debugData.timestamp).toLocaleString()}`
                  : ''}
            </Typography.Text>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DebugPanel;
