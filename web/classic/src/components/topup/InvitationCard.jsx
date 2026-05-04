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
  Typography,
  Button,
} from '@douyinfe/semi-ui';
import { Copy, Users, BarChart2, TrendingUp, Gift, Zap } from 'lucide-react';

const { Text } = Typography;

const InvitationCard = ({
  t,
  userState,
  renderQuota,
  setOpenTransfer,
  affLink,
  handleAffLinkClick,
}) => {
  return (
    <div
      className='!rounded-[20px] overflow-hidden'
      style={{
        background: 'var(--hp-card)',
        boxShadow: 'var(--hp-shadow-md)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className='p-5 sm:p-6'>
        {/* 卡片头部 */}
        <div className='flex items-center mb-6'>
          <div
            className='w-10 h-10 rounded-2xl flex items-center justify-center mr-3'
            style={{ background: 'rgba(var(--hp-accent-rgb), 0.12)' }}
          >
            <Gift size={18} style={{ color: 'var(--hp-accent)' }} />
          </div>
          <div>
            <Typography.Text
              className='text-lg font-semibold'
              style={{ color: 'var(--hp-text)' }}
            >
              {t('邀请奖励')}
            </Typography.Text>
            <div className='text-xs' style={{ color: 'var(--hp-sub)' }}>
              {t('邀请好友获得额外奖励')}
            </div>
          </div>
        </div>

        <div className='space-y-5'>
          {/* 收益统计卡片 */}
          <div
            className='!rounded-2xl overflow-hidden'
            style={{
              background: 'var(--hp-bg-soft)',
              boxShadow: 'var(--hp-shadow)',
            }}
          >
            {/* 渐变头部 */}
            <div
              className='relative recharge-stats-cover'
            >
              <div className='p-5 sm:p-6'>
                <div className='flex justify-between items-center mb-5'>
                  <Text strong style={{ color: 'var(--hp-text)', fontSize: '15px', letterSpacing: '0.01em' }}>
                    {t('收益统计')}
                  </Text>
                  <button
                    disabled={
                      !userState?.user?.aff_quota ||
                      userState?.user?.aff_quota <= 0
                    }
                    onClick={() => setOpenTransfer(true)}
                    className='topup-transfer-btn'
                  >
                    <Zap size={12} />
                    <span>{t('划转到余额')}</span>
                  </button>
                </div>

                <div className='grid grid-cols-3 gap-4'>
                  {[
                    {
                      value: renderQuota(userState?.user?.aff_quota || 0),
                      label: t('待使用收益'),
                      icon: <TrendingUp size={13} style={{ color: 'var(--hp-sub)' }} />,
                    },
                    {
                      value: renderQuota(userState?.user?.aff_history_quota || 0),
                      label: t('总收益'),
                      icon: <BarChart2 size={13} style={{ color: 'var(--hp-sub)' }} />,
                    },
                    {
                      value: userState?.user?.aff_count || 0,
                      label: t('邀请人数'),
                      icon: <Users size={13} style={{ color: 'var(--hp-sub)' }} />,
                    },
                  ].map((stat, i) => (
                    <div key={i} className='text-center'>
                      <div
                        className='text-lg sm:text-xl font-bold mb-1.5'
                        style={{ color: 'var(--hp-text)' }}
                      >
                        {stat.value}
                      </div>
                      <div className='flex items-center justify-center gap-1'>
                        {stat.icon}
                        <Text style={{ color: 'var(--hp-sub)', fontSize: '11px' }}>
                          {stat.label}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 邀请链接 */}
            <div className='p-4 sm:p-5'>
              <div
                className='flex items-center gap-2 rounded-xl px-3 py-2'
                style={{
                  border: '1.5px solid var(--hp-border)',
                  background: 'var(--hp-card)',
                }}
              >
                <Text
                  style={{ color: 'var(--hp-sub)', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {t('邀请链接')}
                </Text>
                <input
                  readOnly
                  value={affLink}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--hp-text)',
                    fontSize: '13px',
                    minWidth: 0,
                  }}
                />
                <button
                  onClick={handleAffLinkClick}
                  className='topup-copy-btn'
                >
                  <Copy size={13} />
                  <span>{t('复制')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 奖励说明 */}
          <div
            className='!rounded-2xl p-4 sm:p-5'
            style={{
              background: 'var(--hp-bg-soft)',
              boxShadow: 'var(--hp-shadow)',
            }}
          >
            <Text
              strong
              className='text-xs block mb-3'
              style={{ color: 'var(--hp-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {t('奖励说明')}
            </Text>
            <div className='space-y-3'>
              {[
                t('邀请好友注册，好友充值后您可获得相应奖励'),
                t('通过划转功能将奖励额度转入到您的账户余额中'),
                t('邀请的好友越多，获得的奖励越多'),
              ].map((text, i) => (
                <div key={i} className='flex items-start gap-3'>
                  <div
                    className='w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5'
                    style={{ background: 'rgba(var(--hp-accent-rgb), 0.1)' }}
                  >
                    <div
                      className='w-1.5 h-1.5 rounded-full'
                      style={{ background: 'var(--hp-accent)' }}
                    />
                  </div>
                  <Text style={{ color: 'var(--hp-sub)', fontSize: '13px', lineHeight: '1.5' }}>
                    {text}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvitationCard;
