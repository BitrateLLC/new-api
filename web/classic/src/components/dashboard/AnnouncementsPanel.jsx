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
import { Card, Tag, Timeline, Empty } from '@douyinfe/semi-ui';
import { Bell } from 'lucide-react';
import { marked } from 'marked';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import ScrollableContainer from '../common/ui/ScrollableContainer';

const AnnouncementsPanel = ({
  announcementData,
  announcementLegendData,
  CARD_PROPS,
  ILLUSTRATION_SIZE,
  t,
}) => {
  return (
    <Card
      {...CARD_PROPS}
      className='db-glass-card lg:col-span-2'
      title={
        <div className='db-card-title-row-between'>
          <div className='db-card-title-row'>
            <Bell size={16} style={{ color: 'var(--hp-accent)' }} />
            {t('系统公告')}
            <Tag color='white' shape='circle' style={{ fontWeight: 400, fontSize: '0.75rem' }}>
              {t('显示最新20条')}
            </Tag>
          </div>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <ScrollableContainer maxHeight='24rem'>
        {announcementData.length > 0 ? (
          <Timeline mode='left'>
            {announcementData.map((item, idx) => {
              const htmlExtra = item.extra ? marked.parse(item.extra) : '';
              return (
                <Timeline.Item
                  key={idx}
                  type={item.type || 'default'}
                  time={`${item.relative ? item.relative + ' ' : ''}${item.time}`}
                  extra={
                    item.extra ? (
                      <div
                        className='text-xs'
                        style={{ color: 'var(--hp-sub)' }}
                        dangerouslySetInnerHTML={{ __html: htmlExtra }}
                      />
                    ) : null
                  }
                >
                  <div>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(item.content || ''),
                      }}
                    />
                  </div>
                </Timeline.Item>
              );
            })}
          </Timeline>
        ) : (
          <div className='flex justify-center items-center py-8'>
            <Empty
              image={<IllustrationConstruction style={ILLUSTRATION_SIZE} />}
              darkModeImage={
                <IllustrationConstructionDark style={ILLUSTRATION_SIZE} />
              }
              title={t('暂无系统公告')}
              description={t('请联系管理员在系统设置中配置公告信息')}
            />
          </div>
        )}
      </ScrollableContainer>

      {/* 公告状态图例 */}
      {announcementLegendData && announcementLegendData.length > 0 && (
        <div className='db-legend-bar'>
          <div className='db-legend-items'>
            {announcementLegendData.map((legend, index) => {
              const colorMap = {
                grey: 'var(--hp-muted)',
                blue: 'var(--hp-accent)',
                green: '#10b981',
                orange: 'var(--hp-accent-dark)',
                red: '#ef4444',
              };
              return (
                <div key={index} className='db-legend-item'>
                  <div
                    className='db-legend-dot'
                    style={{
                      backgroundColor: colorMap[legend.color] || 'var(--hp-muted)',
                      boxShadow: `0 0 0 2px ${colorMap[legend.color] || 'var(--hp-muted)'}33`,
                    }}
                  />
                  <span className='db-legend-label'>{legend.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

export default AnnouncementsPanel;
