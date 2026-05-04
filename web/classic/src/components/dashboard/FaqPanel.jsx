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

import React, { useState } from 'react';
import { Card, Empty } from '@douyinfe/semi-ui';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { marked } from 'marked';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import ScrollableContainer from '../common/ui/ScrollableContainer';

const FaqItem = ({ item, index, isOpen, onToggle }) => {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--hp-border, rgba(0,0,0,0.06))',
        overflow: 'hidden',
      }}
    >
      {/* 问题行 */}
      <button
        onClick={() => onToggle(index)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '12px',
          transition: 'background 0.15s ease',
          backgroundColor: isOpen
            ? 'var(--hp-bg-soft, rgba(0,0,0,0.02))'
            : 'transparent',
        }}
        onMouseEnter={e => {
          if (!isOpen)
            e.currentTarget.style.backgroundColor =
              'var(--hp-bg-soft, rgba(0,0,0,0.02))';
        }}
        onMouseLeave={e => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span
          style={{
            fontWeight: 500,
            color: 'var(--hp-text)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            flex: 1,
          }}
        >
          {item.question}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--hp-sub)',
            flexShrink: 0,
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* 答案区 — CSS max-height 动画 */}
      <div
        style={{
          maxHeight: isOpen ? '600px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          style={{
            padding: '4px 20px 16px 20px',
            color: 'var(--hp-sub)',
            lineHeight: 1.75,
            fontSize: '0.875rem',
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parse(item.answer || ''),
          }}
        />
      </div>
    </div>
  );
};

const FaqPanel = ({
  faqData,
  CARD_PROPS,
  FLEX_CENTER_GAP2,
  ILLUSTRATION_SIZE,
  t,
}) => {
  const [openIndex, setOpenIndex] = useState(null);

  const handleToggle = index => {
    setOpenIndex(prev => (prev === index ? null : index));
  };

  return (
    <Card
      {...CARD_PROPS}
      className='!rounded-2xl lg:col-span-1'
      style={{
        borderRadius: '16px',
        boxShadow: 'var(--hp-shadow)',
        backgroundColor: 'var(--hp-card)',
        border: '1px solid var(--hp-border, rgba(0,0,0,0.06))',
        transition: 'box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--hp-shadow-md)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--hp-shadow)';
      }}
      title={
        <div
          style={{
            fontWeight: 600,
            fontSize: '1rem',
            color: 'var(--hp-text)',
            gap: '8px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <HelpCircle
            size={16}
            style={{ color: 'var(--hp-sub)', flexShrink: 0 }}
          />
          {t('常见问答')}
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <ScrollableContainer maxHeight='24rem'>
        {faqData.length > 0 ? (
          <div>
            {faqData.map((item, index) => (
              <FaqItem
                key={index}
                item={item}
                index={index}
                isOpen={openIndex === index}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '2rem 1rem',
            }}
          >
            <Empty
              image={<IllustrationConstruction style={ILLUSTRATION_SIZE} />}
              darkModeImage={
                <IllustrationConstructionDark style={ILLUSTRATION_SIZE} />
              }
              title={
                <span style={{ color: 'var(--hp-text)', fontWeight: 500 }}>
                  {t('暂无常见问答')}
                </span>
              }
              description={
                <span style={{ color: 'var(--hp-muted)', fontSize: '0.8rem' }}>
                  {t('请联系管理员在系统设置中配置常见问答')}
                </span>
              }
            />
          </div>
        )}
      </ScrollableContainer>
    </Card>
  );
};

export default FaqPanel;
