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
import { Card, Skeleton, Tag } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CARD_VARIANT = ['db-stats-card-1', 'db-stats-card-2', 'db-stats-card-3', 'db-stats-card-4'];

const StatsCards = ({
  groupedStatsData,
  loading,
  getTrendSpec,
  CARD_PROPS,
  CHART_CONFIG,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className='db-section'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5'>
        {groupedStatsData.map((group, idx) => (
          <Card
            key={idx}
            {...CARD_PROPS}
            className={`db-stats-card ${CARD_VARIANT[idx % 4]}`}
            title={group.title}
          >
            <div className='space-y-4'>
              {group.items.map((item, itemIdx) => (
                <div
                  key={itemIdx}
                  className='db-stat-item'
                  onClick={item.onClick}
                >
                  <div className='flex items-center'>
                    <div className='db-stat-icon-wrap mr-3'>
                      {item.icon}
                    </div>
                    <div>
                      <div className='db-stat-label'>{item.title}</div>
                      <div className='db-stat-value'>
                        <Skeleton
                          loading={loading}
                          active
                          placeholder={
                            <Skeleton.Paragraph
                              active
                              rows={1}
                              style={{
                                width: '65px',
                                height: '28px',
                                marginTop: '4px',
                                borderRadius: '8px',
                                background: 'rgba(var(--hp-accent-rgb), 0.08)',
                              }}
                            />
                          }
                        >
                          {item.value}
                        </Skeleton>
                      </div>
                    </div>
                  </div>
                  {item.title === t('当前余额') ? (
                    <Tag
                      color='white'
                      shape='circle'
                      size='large'
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/console/topup');
                      }}
                      className='db-topup-tag'
                    >
                      {t('充值')}
                    </Tag>
                  ) : (
                    (loading ||
                      (item.trendData && item.trendData.length > 0)) && (
                      <div className='w-24 h-10'>
                        <VChart
                          spec={getTrendSpec(item.trendData, item.trendColor)}
                          option={CHART_CONFIG}
                        />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default StatsCards;
