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
import {
  Card,
  Button,
  Spin,
  Tabs,
  TabPane,
  Tag,
  Empty,
} from '@douyinfe/semi-ui';
import { Gauge, RefreshCw } from 'lucide-react';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import ScrollableContainer from '../common/ui/ScrollableContainer';

const UptimePanel = ({
  uptimeData,
  uptimeLoading,
  activeUptimeTab,
  setActiveUptimeTab,
  loadUptimeData,
  uptimeLegendData,
  announcementLegendData,
  renderMonitorList,
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
            <Gauge size={16} style={{ color: 'var(--hp-accent)' }} />
            {t('服务可用性')}
          </div>
          <Button
            icon={<RefreshCw size={14} />}
            onClick={loadUptimeData}
            loading={uptimeLoading}
            size='small'
            theme='borderless'
            type='tertiary'
            style={{
              color: 'var(--hp-sub)',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <div style={{ position: 'relative' }}>
        <Spin spinning={uptimeLoading}>
          {uptimeData.length > 0 ? (
            uptimeData.length === 1 ? (
              <ScrollableContainer maxHeight='24rem'>
                {renderMonitorList(uptimeData[0].monitors)}
              </ScrollableContainer>
            ) : (
              <Tabs
                type='card'
                collapsible
                activeKey={activeUptimeTab}
                onChange={setActiveUptimeTab}
                size='small'
                style={{ borderRadius: '0 0 12px 12px' }}
                tabBarStyle={{
                  padding: '0 12px',
                  borderBottom: '1px solid var(--hp-border, rgba(0,0,0,0.06))',
                  marginBottom: 0,
                }}
              >
                {uptimeData.map((group, groupIdx) => (
                  <TabPane
                    tab={
                      <span className='db-uptime-tab'>
                        <Gauge size={13} style={{ color: 'var(--hp-sub)' }} />
                        {group.categoryName}
                        <Tag
                          color={activeUptimeTab === group.categoryName ? 'blue' : 'grey'}
                          size='small'
                          shape='circle'
                          style={{
                            fontSize: '0.7rem',
                            minWidth: '18px',
                            height: '18px',
                            lineHeight: '18px',
                          }}
                        >
                          {group.monitors ? group.monitors.length : 0}
                        </Tag>
                      </span>
                    }
                    itemKey={group.categoryName}
                    key={groupIdx}
                  >
                    <ScrollableContainer maxHeight='21.5rem'>
                      {renderMonitorList(group.monitors)}
                    </ScrollableContainer>
                  </TabPane>
                ))}
              </Tabs>
            )
          ) : (
            <div className='flex justify-center items-center' style={{ padding: '2rem 1rem' }}>
              <Empty
                image={<IllustrationConstruction style={ILLUSTRATION_SIZE} />}
                darkModeImage={<IllustrationConstructionDark style={ILLUSTRATION_SIZE} />}
                title={<span style={{ color: 'var(--hp-text)', fontWeight: 500 }}>{t('暂无监控数据')}</span>}
                description={<span style={{ color: 'var(--hp-muted)', fontSize: '0.8rem' }}>{t('请联系管理员在系统设置中配置Uptime')}</span>}
              />
            </div>
          )}
        </Spin>
      </div>

      {/* 图例 */}
      {(uptimeData.length > 0 || (announcementLegendData && announcementLegendData.length > 0)) && (
        <div className='db-legend-bar'>
          <div className='db-legend-items'>
            {uptimeData.length > 0 && uptimeLegendData.map((legend, index) => (
              <div key={`uptime-${index}`} className='db-legend-item'>
                <div
                  className='db-legend-dot'
                  style={{
                    backgroundColor: legend.color,
                    boxShadow: `0 0 0 2px ${legend.color}33`,
                  }}
                />
                <span className='db-legend-label'>{legend.label}</span>
              </div>
            ))}

            {uptimeData.length > 0 && announcementLegendData && announcementLegendData.length > 0 && (
              <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--hp-border, rgba(0,0,0,0.1))', flexShrink: 0 }} />
            )}

            {announcementLegendData && announcementLegendData.map((legend, index) => {
              const colorMap = {
                grey: 'var(--hp-muted)',
                blue: 'var(--hp-accent)',
                green: '#10b981',
                orange: 'var(--hp-accent-dark)',
                red: '#ef4444',
              };
              return (
                <div key={`ann-${index}`} className='db-legend-item'>
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

export default UptimePanel;
