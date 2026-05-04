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

import React, { useEffect, useRef } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import MarkdownRenderer from '../common/markdown/MarkdownRenderer';
import { ChevronRight, ChevronUp, Brain, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ThinkingContent = ({
  message,
  finalExtractedThinkingContent,
  thinkingSource,
  styleState,
  onToggleReasoningExpansion,
}) => {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const lastContentRef = useRef('');

  const isThinkingStatus =
    message.status === 'loading' || message.status === 'incomplete';
  const headerText =
    isThinkingStatus && !message.isThinkingComplete
      ? t('思考中...')
      : t('思考过程');

  useEffect(() => {
    if (
      scrollRef.current &&
      finalExtractedThinkingContent &&
      message.isReasoningExpanded
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [finalExtractedThinkingContent, message.isReasoningExpanded]);

  useEffect(() => {
    if (!isThinkingStatus) {
      lastContentRef.current = '';
    }
  }, [isThinkingStatus]);

  if (!finalExtractedThinkingContent) return null;

  let prevLength = 0;
  if (isThinkingStatus && lastContentRef.current) {
    if (finalExtractedThinkingContent.startsWith(lastContentRef.current)) {
      prevLength = lastContentRef.current.length;
    }
  }

  if (isThinkingStatus) {
    lastContentRef.current = finalExtractedThinkingContent;
  }

  return (
    <div
      style={{
        borderRadius: '12px',
        marginBottom: '12px',
        overflow: 'hidden',
        border: '1px solid var(--hp-border)',
        background: 'var(--hp-bg-soft)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer',
          borderBottom: message.isReasoningExpanded
            ? '1px solid var(--hp-border)'
            : 'none',
          transition: 'all 0.2s ease',
        }}
        onClick={() => onToggleReasoningExpansion(message.id)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'var(--hp-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease',
            }}
          >
            <Brain
              size={styleState.isMobile ? 12 : 14}
              style={{ color: 'var(--hp-sub)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <Typography.Text
              strong
              style={{
                color: 'var(--hp-text)',
                fontSize: styleState.isMobile ? '13px' : '14px',
              }}
            >
              {headerText}
            </Typography.Text>
            {thinkingSource && (
              <Typography.Text
                style={{
                  color: 'var(--hp-sub)',
                  fontSize: '11px',
                }}
              >
                来源: {thinkingSource}
              </Typography.Text>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isThinkingStatus && !message.isThinkingComplete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2
                style={{ color: 'var(--hp-sub)' }}
                className='animate-spin'
                size={styleState.isMobile ? 13 : 15}
              />
              <Typography.Text
                style={{
                  color: 'var(--hp-sub)',
                  fontSize: styleState.isMobile ? '11px' : '12px',
                }}
              >
                思考中
              </Typography.Text>
            </div>
          )}
          {(!isThinkingStatus || message.isThinkingComplete) && (
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                background: 'var(--hp-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              {message.isReasoningExpanded ? (
                <ChevronUp
                  size={styleState.isMobile ? 12 : 14}
                  style={{ color: 'var(--hp-sub)' }}
                />
              ) : (
                <ChevronRight
                  size={styleState.isMobile ? 12 : 14}
                  style={{ color: 'var(--hp-sub)' }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expandable content */}
      <div
        style={{
          maxHeight: message.isReasoningExpanded ? '320px' : '0px',
          opacity: message.isReasoningExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.4s ease, opacity 0.3s ease',
        }}
      >
        {message.isReasoningExpanded && (
          <div style={{ padding: '12px 16px' }}>
            <div
              ref={scrollRef}
              style={{
                background: 'var(--hp-bg-soft)',
                borderLeft: '2px dashed var(--hp-border)',
                borderRadius: '12px',
                padding: '12px 16px',
                maxHeight: '220px',
                overflowX: 'auto',
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--hp-border) transparent',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  fontSize: styleState.isMobile ? '12px' : '13px',
                  lineHeight: '1.6',
                  color: 'var(--hp-text)',
                }}
              >
                <MarkdownRenderer
                  content={finalExtractedThinkingContent}
                  className=''
                  animated={isThinkingStatus}
                  previousContentLength={prevLength}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingContent;
