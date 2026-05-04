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

import React from 'react';
import { Card, Chat, Typography, Button } from '@douyinfe/semi-ui';
import { MessageSquare, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CustomInputRender from './CustomInputRender';

const ChatArea = ({
  chatRef,
  message,
  inputs,
  styleState,
  showDebugPanel,
  roleInfo,
  onMessageSend,
  onMessageCopy,
  onMessageReset,
  onMessageDelete,
  onStopGenerator,
  onClearMessages,
  onToggleDebugPanel,
  renderCustomChatContent,
  renderChatBoxAction,
}) => {
  const { t } = useTranslation();

  const renderInputArea = React.useCallback((props) => {
    return <CustomInputRender {...props} />;
  }, []);

  return (
    <Card
      className='h-full min-h-0'
      bordered={false}
      style={{ background: 'var(--hp-card)', borderRadius: '16px' }}
      bodyStyle={{
        padding: 0,
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 聊天头部 */}
      {styleState.isMobile ? (
        <div className='pt-4'></div>
      ) : (
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
                <MessageSquare size={16} style={{ color: 'var(--hp-accent)' }} />
              </div>
              <div>
                <Typography.Title heading={6} className='mb-0' style={{ color: 'var(--hp-text)' }}>
                  {t('AI 对话')}
                </Typography.Title>
                <Typography.Text className='text-xs hidden sm:inline' style={{ color: 'var(--hp-sub)' }}>
                  {inputs.model || t('选择模型开始对话')}
                </Typography.Text>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                icon={showDebugPanel ? <EyeOff size={13} /> : <Eye size={13} />}
                onClick={onToggleDebugPanel}
                theme='borderless'
                type='tertiary'
                size='small'
                style={{ borderRadius: '8px', color: 'var(--hp-sub)' }}
              >
                {showDebugPanel ? t('隐藏调试') : t('显示调试')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 聊天内容区域 */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        <Chat
          ref={chatRef}
          chatBoxRenderConfig={{
            renderChatBoxContent: renderCustomChatContent,
            renderChatBoxAction: renderChatBoxAction,
            renderChatBoxTitle: () => null,
          }}
          renderInputArea={renderInputArea}
          roleConfig={roleInfo}
          style={{
            height: '100%',
            maxWidth: '100%',
            overflow: 'hidden',
            background: 'var(--hp-card)',
          }}
          chats={message}
          onMessageSend={onMessageSend}
          onMessageCopy={onMessageCopy}
          onMessageReset={onMessageReset}
          onMessageDelete={onMessageDelete}
          showClearContext
          showStopGenerate
          onStopGenerator={onStopGenerator}
          onClear={onClearMessages}
          className='h-full'
          placeholder={t('请输入您的问题...')}
        />
      </div>
    </Card>
  );
};

export default ChatArea;
