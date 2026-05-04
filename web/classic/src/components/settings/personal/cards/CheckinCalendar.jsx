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

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Calendar,
  Button,
  Typography,
  Avatar,
  Spin,
  Tooltip,
  Collapsible,
  Modal,
} from '@douyinfe/semi-ui';
import {
  CalendarCheck,
  Gift,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Turnstile from 'react-turnstile';
import { API, showError, showSuccess, renderQuota } from '../../../../helpers';

const CheckinCalendar = ({ t, status, turnstileEnabled, turnstileSiteKey }) => {
  const [loading, setLoading] = useState(false);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [turnstileModalVisible, setTurnstileModalVisible] = useState(false);
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const [checkinData, setCheckinData] = useState({
    enabled: false,
    stats: {
      checked_in_today: false,
      total_checkins: 0,
      total_quota: 0,
      checkin_count: 0,
      records: [],
    },
  });
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(null);

  const checkinRecordsMap = useMemo(() => {
    const map = {};
    const records = checkinData.stats?.records || [];
    records.forEach((record) => {
      map[record.checkin_date] = record.quota_awarded;
    });
    return map;
  }, [checkinData.stats?.records]);

  const monthlyQuota = useMemo(() => {
    const records = checkinData.stats?.records || [];
    return records.reduce(
      (sum, record) => sum + (record.quota_awarded || 0),
      0,
    );
  }, [checkinData.stats?.records]);

  const fetchCheckinStatus = async (month) => {
    const isFirstLoad = !initialLoaded;
    setLoading(true);
    try {
      const res = await API.get(`/api/user/checkin?month=${month}`);
      const { success, data, message } = res.data;
      if (success) {
        setCheckinData(data);
        if (isFirstLoad) {
          setIsCollapsed(data.stats?.checked_in_today ?? false);
          setInitialLoaded(true);
        }
      } else {
        showError(message || t('获取签到状态失败'));
        if (isFirstLoad) {
          setIsCollapsed(false);
          setInitialLoaded(true);
        }
      }
    } catch (error) {
      showError(t('获取签到状态失败'));
      if (isFirstLoad) {
        setIsCollapsed(false);
        setInitialLoaded(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const postCheckin = async (token) => {
    const url = token
      ? `/api/user/checkin?turnstile=${encodeURIComponent(token)}`
      : '/api/user/checkin';
    return API.post(url);
  };

  const shouldTriggerTurnstile = (message) => {
    if (!turnstileEnabled) return false;
    if (typeof message !== 'string') return true;
    return message.includes('Turnstile');
  };

  const doCheckin = async (token) => {
    setCheckinLoading(true);
    try {
      const res = await postCheckin(token);
      const { success, data, message } = res.data;
      if (success) {
        showSuccess(
          t('签到成功！获得') + ' ' + renderQuota(data.quota_awarded),
        );
        fetchCheckinStatus(currentMonth);
        setTurnstileModalVisible(false);
      } else {
        if (!token && shouldTriggerTurnstile(message)) {
          if (!turnstileSiteKey) {
            showError('Turnstile is enabled but site key is empty.');
            return;
          }
          setTurnstileModalVisible(true);
          return;
        }
        if (token && shouldTriggerTurnstile(message)) {
          setTurnstileWidgetKey((v) => v + 1);
        }
        showError(message || t('签到失败'));
      }
    } catch (error) {
      showError(t('签到失败'));
    } finally {
      setCheckinLoading(false);
    }
  };

  useEffect(() => {
    if (status?.checkin_enabled) {
      fetchCheckinStatus(currentMonth);
    }
  }, [status?.checkin_enabled, currentMonth]);

  if (!status?.checkin_enabled) {
    return null;
  }

  const dateRender = (dateString) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    const quotaAwarded = checkinRecordsMap[formattedDate];
    const isCheckedIn = quotaAwarded !== undefined;

    if (isCheckedIn) {
      return (
        <Tooltip
          content={`${t('获得')} ${renderQuota(quotaAwarded)}`}
          position='top'
        >
          <div className='absolute inset-0 flex flex-col items-center justify-center cursor-pointer'>
            <div
              className='w-6 h-6 rounded-full flex items-center justify-center mb-0.5 shadow-sm'
              style={{
                background: 'rgba(var(--hp-accent-rgb), 0.15)',
                border: '1.5px solid var(--hp-accent)',
                transition: 'all 0.2s ease',
              }}
            >
              <Check
                size={13}
                style={{ color: 'var(--hp-accent)' }}
                strokeWidth={3}
              />
            </div>
            <div
              className='text-[10px] font-medium leading-none'
              style={{ color: 'var(--hp-accent)' }}
            >
              {renderQuota(quotaAwarded)}
            </div>
          </div>
        </Tooltip>
      );
    }
    return null;
  };

  const handleMonthChange = (date) => {
    const month = date.toISOString().slice(0, 7);
    setCurrentMonth(month);
  };

  const checkedInToday = checkinData.stats?.checked_in_today;

  return (
    <Card
      className='!rounded-2xl'
      style={{
        background: 'var(--hp-card)',
        border: '1px solid var(--hp-border)',
        boxShadow: 'var(--hp-shadow)',
        transition: 'all 0.2s ease',
      }}
    >
      <Modal
        title='Security Check'
        visible={turnstileModalVisible}
        footer={null}
        centered
        onCancel={() => {
          setTurnstileModalVisible(false);
          setTurnstileWidgetKey((v) => v + 1);
        }}
      >
        <div className='flex justify-center py-2'>
          <Turnstile
            key={turnstileWidgetKey}
            sitekey={turnstileSiteKey}
            onVerify={(token) => doCheckin(token)}
            onExpire={() => setTurnstileWidgetKey((v) => v + 1)}
          />
        </div>
      </Modal>

      {/* 卡片头部 */}
      <div className='flex items-center justify-between'>
        <div
          className='flex items-center flex-1 cursor-pointer select-none'
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ transition: 'all 0.2s ease' }}
        >
          <Avatar
            size='small'
            className='mr-3'
            style={{
              background: 'rgba(var(--hp-accent-rgb), 0.12)',
              color: 'var(--hp-accent)',
              boxShadow: 'none',
              flexShrink: 0,
            }}
          >
            <CalendarCheck size={16} />
          </Avatar>
          <div className='flex-1'>
            <div className='flex items-center gap-2'>
              <Typography.Text
                className='text-lg font-medium'
                style={{ color: 'var(--hp-text)' }}
              >
                {t('每日签到')}
              </Typography.Text>
              {isCollapsed ? (
                <ChevronDown size={15} style={{ color: 'var(--hp-sub)' }} />
              ) : (
                <ChevronUp size={15} style={{ color: 'var(--hp-sub)' }} />
              )}
            </div>
            <div className='text-xs' style={{ color: 'var(--hp-sub)' }}>
              {!initialLoaded
                ? t('正在加载签到状态...')
                : checkedInToday
                  ? t('今日已签到，累计签到') +
                    ` ${checkinData.stats?.total_checkins || 0} ` +
                    t('天')
                  : t('每日签到可获得随机额度奖励')}
            </div>
          </div>
        </div>

        <Button
          type='primary'
          theme='solid'
          icon={<Gift size={15} />}
          onClick={() => doCheckin()}
          loading={checkinLoading || !initialLoaded}
          disabled={!initialLoaded || checkedInToday}
          style={{
            borderRadius: '10px',
            background: checkedInToday
              ? undefined
              : 'var(--hp-accent)',
            border: 'none',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          {!initialLoaded
            ? t('加载中...')
            : checkedInToday
              ? t('今日已签到')
              : t('立即签到')}
        </Button>
      </div>

      {/* 可折叠内容 */}
      <Collapsible isOpen={isCollapsed === false} keepDOM>
        {/* 签到统计 */}
        <div className='grid grid-cols-3 gap-3 mb-4 mt-4'>
          {[
            {
              value: checkinData.stats?.total_checkins || 0,
              label: t('累计签到'),
            },
            {
              value: renderQuota(monthlyQuota, 6),
              label: t('本月获得'),
            },
            {
              value: renderQuota(checkinData.stats?.total_quota || 0, 6),
              label: t('累计获得'),
            },
          ].map((item, i) => (
            <div
              key={i}
              className='text-center py-3 px-2 rounded-xl'
              style={{
                background: 'rgba(var(--hp-accent-rgb), 0.06)',
                border: '1px solid rgba(var(--hp-accent-rgb), 0.12)',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                className='text-xl font-bold'
                style={{ color: 'var(--hp-accent)' }}
              >
                {item.value}
              </div>
              <div className='text-xs mt-0.5' style={{ color: 'var(--hp-sub)' }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* 签到日历 */}
        <Spin spinning={loading}>
          <div
            className='rounded-xl overflow-hidden checkin-calendar'
            style={{
              border: '1px solid var(--hp-border)',
              transition: 'all 0.2s ease',
            }}
          >
            <style>{`
              .checkin-calendar .semi-calendar {
                font-size: 13px;
                background: transparent;
              }
              .checkin-calendar .semi-calendar-month-header {
                padding: 8px 12px;
              }
              .checkin-calendar .semi-calendar-month-week-row {
                height: 28px;
              }
              .checkin-calendar .semi-calendar-month-week-row th {
                font-size: 12px;
                padding: 4px 0;
                color: var(--hp-sub);
              }
              .checkin-calendar .semi-calendar-month-grid-row {
                height: auto;
              }
              .checkin-calendar .semi-calendar-month-grid-row td {
                height: 56px;
                padding: 2px;
              }
              .checkin-calendar .semi-calendar-month-grid-row-cell {
                position: relative;
                height: 100%;
              }
              .checkin-calendar .semi-calendar-month-grid-row-cell-day {
                position: absolute;
                top: 4px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 12px;
                z-index: 1;
                color: var(--hp-text);
              }
              .checkin-calendar .semi-calendar-month-same {
                background: transparent;
              }
              .checkin-calendar .semi-calendar-month-today .semi-calendar-month-grid-row-cell-day {
                background: var(--hp-accent);
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
              }
            `}</style>
            <Calendar
              mode='month'
              onChange={handleMonthChange}
              dateGridRender={(dateString, date) => dateRender(dateString)}
            />
          </div>
        </Spin>

        {/* 签到说明 */}
        <div
          className='mt-3 p-3 rounded-xl'
          style={{
            background: 'rgba(var(--hp-accent-rgb), 0.04)',
            border: '1px solid rgba(var(--hp-accent-rgb), 0.1)',
          }}
        >
          <Typography.Text type='tertiary' className='text-xs'>
            <ul className='list-disc list-inside space-y-0.5' style={{ color: 'var(--hp-sub)' }}>
              <li>{t('每日签到可获得随机额度奖励')}</li>
              <li>{t('签到奖励将直接添加到您的账户余额')}</li>
              <li>{t('每日仅可签到一次，请勿重复签到')}</li>
            </ul>
          </Typography.Text>
        </div>
      </Collapsible>
    </Card>
  );
};

export default CheckinCalendar;
