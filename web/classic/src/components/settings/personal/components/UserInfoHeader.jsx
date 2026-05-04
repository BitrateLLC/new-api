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
import { Avatar, Card, Tag, Divider, Typography, Badge } from '@douyinfe/semi-ui';
import { isRoot, isAdmin, renderQuota, stringToColor } from '../../../../helpers';
import { Coins, BarChart2, Users } from 'lucide-react';

const UserInfoHeader = ({ t, userState }) => {
  const getUsername = () => userState.user ? userState.user.username : 'null';
  const getAvatarText = () => {
    const username = getUsername();
    return username && username.length > 0 ? username.slice(0, 2).toUpperCase() : 'NA';
  };

  return (
    <Card
      className='!rounded-2xl overflow-hidden'
      style={{
        background: 'var(--hp-card)',
        border: '1px solid var(--hp-border)',
        boxShadow: 'var(--hp-shadow)',
        transition: 'all 0.2s ease',
      }}
      bodyStyle={{ padding: '20px 24px' }}
      cover={
        <div
          className='relative h-36'
          style={{
            backgroundImage: `linear-gradient(160deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%), url('/cover-4.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className='relative z-10 h-full flex flex-col justify-end px-6 pb-5'>
            <div className='flex items-center gap-4'>
              <Avatar
                size='extra-large'
                color={stringToColor(getUsername())}
                style={{
                  width: 64,
                  height: 64,
                  fontSize: 22,
                  fontWeight: 600,
                  flexShrink: 0,
                  boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
                  border: '2px solid rgba(255,255,255,0.5)',
                  transition: 'all 0.2s ease',
                }}
              >
                {getAvatarText()}
              </Avatar>
              <div className='flex flex-col justify-center gap-1.5 min-w-0'>
                <div
                  className='text-xl font-semibold truncate'
                  style={{ color: 'white', letterSpacing: '-0.01em' }}
                >
                  {getUsername()}
                </div>
                <div className='flex flex-wrap items-center gap-1.5'>
                  {isRoot() ? (
                    <Tag
                      size='small'
                      shape='circle'
                      style={{
                        color: 'white',
                        background: 'rgba(255,255,255,0.18)',
                        border: 'none',
                        backdropFilter: 'blur(4px)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {t('超级管理员')}
                    </Tag>
                  ) : isAdmin() ? (
                    <Tag
                      size='small'
                      shape='circle'
                      style={{
                        color: 'white',
                        background: 'rgba(255,255,255,0.18)',
                        border: 'none',
                        backdropFilter: 'blur(4px)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {t('管理员')}
                    </Tag>
                  ) : (
                    <Tag
                      size='small'
                      shape='circle'
                      style={{
                        color: 'white',
                        background: 'rgba(255,255,255,0.18)',
                        border: 'none',
                        backdropFilter: 'blur(4px)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {t('普通用户')}
                    </Tag>
                  )}
                  <Tag
                    size='small'
                    shape='circle'
                    style={{
                      color: 'white',
                      background: 'rgba(255,255,255,0.18)',
                      border: 'none',
                      backdropFilter: 'blur(4px)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    ID: {userState?.user?.id}
                  </Tag>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      {/* 余额 + 统计 */}
      <div className='flex items-start justify-between gap-6'>
        <div>
          <div
            className='text-xs font-medium mb-1'
            style={{ color: 'var(--hp-sub)' }}
          >
            {t('当前余额')}
          </div>
          <div
            className='text-3xl font-bold tracking-tight'
            style={{
              color: 'var(--hp-text, inherit)',
              letterSpacing: '-0.02em',
            }}
          >
            {renderQuota(userState?.user?.quota)}
          </div>
        </div>

        {/* 桌面端统计 */}
        <div className='hidden lg:block flex-shrink-0'>
          <div
            className='flex items-center gap-4 px-4 py-3 rounded-2xl'
            style={{
              background: 'var(--hp-bg, var(--semi-color-fill-0))',
              border: '1px solid var(--hp-border)',
              transition: 'all 0.2s ease',
            }}
          >
            <StatItem
              icon={<Coins size={14} />}
              label={t('历史消耗')}
              value={renderQuota(userState?.user?.used_quota)}
            />
            <Divider layout='vertical' style={{ height: 28 }} />
            <StatItem
              icon={<BarChart2 size={14} />}
              label={t('请求次数')}
              value={userState.user?.request_count || 0}
            />
            <Divider layout='vertical' style={{ height: 28 }} />
            <StatItem
              icon={<Users size={14} />}
              label={t('用户分组')}
              value={userState?.user?.group || t('默认')}
            />
          </div>
        </div>
      </div>

      {/* 移动端统计 */}
      <div className='lg:hidden mt-4'>
        <div
          className='rounded-2xl overflow-hidden divide-y'
          style={{
            border: '1px solid var(--hp-border)',
            background: 'var(--hp-bg, var(--semi-color-fill-0))',
          }}
        >
          <MobileStatRow
            icon={<Coins size={14} />}
            label={t('历史消耗')}
            value={renderQuota(userState?.user?.used_quota)}
          />
          <MobileStatRow
            icon={<BarChart2 size={14} />}
            label={t('请求次数')}
            value={userState.user?.request_count || 0}
          />
          <MobileStatRow
            icon={<Users size={14} />}
            label={t('用户分组')}
            value={userState?.user?.group || t('默认')}
          />
        </div>
      </div>
    </Card>
  );
};

const StatItem = ({ icon, label, value }) => (
  <div className='flex items-center gap-2'>
    <span style={{ color: 'var(--hp-sub)' }}>{icon}</span>
    <Typography.Text size='small' style={{ color: 'var(--hp-sub)' }}>
      {label}
    </Typography.Text>
    <Typography.Text size='small' strong style={{ color: 'var(--hp-text)' }}>
      {value}
    </Typography.Text>
  </div>
);

const MobileStatRow = ({ icon, label, value }) => (
  <div
    className='flex items-center justify-between px-4 py-3'
    style={{ transition: 'all 0.2s ease' }}
  >
    <div className='flex items-center gap-2' style={{ color: 'var(--hp-sub)' }}>
      {icon}
      <Typography.Text size='small' style={{ color: 'var(--hp-sub)' }}>
        {label}
      </Typography.Text>
    </div>
    <Typography.Text size='small' strong style={{ color: 'var(--hp-text)' }}>
      {value}
    </Typography.Text>
  </div>
);

export default UserInfoHeader;
