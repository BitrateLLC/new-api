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

import React, { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Typography,
  Tag,
  Card,
  Button,
  Banner,
  Skeleton,
  Form,
  Space,
  Row,
  Col,
  Spin,
  Tooltip,
  Tabs,
  TabPane,
} from '@douyinfe/semi-ui';
import { SiAlipay, SiWechat, SiStripe } from 'react-icons/si';
import {
  CreditCard,
  Coins,
  Wallet,
  BarChart2,
  TrendingUp,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { IconGift } from '@douyinfe/semi-icons';
import { useMinimumLoadingTime } from '../../hooks/common/useMinimumLoadingTime';
import { getCurrencyConfig } from '../../helpers/render';
import SubscriptionPlansCard from './SubscriptionPlansCard';

const { Text } = Typography;

const RechargeCard = ({
  t,
  enableOnlineTopUp,
  enableStripeTopUp,
  enableCreemTopUp,
  creemProducts,
  creemPreTopUp,
  presetAmounts,
  selectedPreset,
  selectPresetAmount,
  formatLargeNumber,
  priceRatio,
  topUpCount,
  minTopUp,
  renderQuotaWithAmount,
  getAmount,
  setTopUpCount,
  setSelectedPreset,
  renderAmount,
  amountLoading,
  payMethods,
  preTopUp,
  paymentLoading,
  payWay,
  redemptionCode,
  setRedemptionCode,
  topUp,
  isSubmitting,
  topUpLink,
  openTopUpLink,
  userState,
  renderQuota,
  statusLoading,
  topupInfo,
  onOpenHistory,
  enableWaffoTopUp,
  waffoTopUp,
  waffoPayMethods,
  subscriptionLoading = false,
  subscriptionPlans = [],
  billingPreference,
  onChangeBillingPreference,
  activeSubscriptions = [],
  allSubscriptions = [],
  reloadSubscriptionSelf,
}) => {
  const onlineFormApiRef = useRef(null);
  const redeemFormApiRef = useRef(null);
  const initialTabSetRef = useRef(false);
  const showAmountSkeleton = useMinimumLoadingTime(amountLoading);
  const [activeTab, setActiveTab] = useState('topup');
  const shouldShowSubscription =
    !subscriptionLoading && subscriptionPlans.length > 0;

  useEffect(() => {
    if (initialTabSetRef.current) return;
    if (subscriptionLoading) return;
    setActiveTab(shouldShowSubscription ? 'subscription' : 'topup');
    initialTabSetRef.current = true;
  }, [shouldShowSubscription, subscriptionLoading]);

  useEffect(() => {
    if (!shouldShowSubscription && activeTab !== 'topup') {
      setActiveTab('topup');
    }
  }, [shouldShowSubscription, activeTab]);

  const topupContent = (
    <div className='space-y-5'>
      {/* 账户统计区域 */}
      <div
        className='!rounded-2xl overflow-hidden'
        style={{
          background: 'var(--hp-bg-soft)',
          boxShadow: 'var(--hp-shadow)',
        }}
      >
        <div
          className='relative recharge-stats-cover'
        >
          <div className='relative z-10 p-5 sm:p-6'>
            <div className='flex justify-between items-center mb-5'>
              <Text strong style={{ color: 'var(--hp-text)', fontSize: '15px', letterSpacing: '0.01em' }}>
                {t('账户统计')}
              </Text>
            </div>

            <div className='grid grid-cols-3 gap-4 sm:gap-6'>
              {[
                {
                  value: renderQuota(userState?.user?.quota),
                  label: t('当前余额'),
                  icon: <Wallet size={13} style={{ color: 'var(--hp-sub)' }} />,
                },
                {
                  value: renderQuota(userState?.user?.used_quota),
                  label: t('历史消耗'),
                  icon: <TrendingUp size={13} style={{ color: 'var(--hp-sub)' }} />,
                },
                {
                  value: userState?.user?.request_count || 0,
                  label: t('请求次数'),
                  icon: <BarChart2 size={13} style={{ color: 'var(--hp-sub)' }} />,
                },
              ].map((stat, i) => (
                <div key={i} className='text-center'>
                  <div
                    className='text-lg sm:text-2xl font-bold mb-1.5'
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

        {/* 在线充值表单 */}
        <div className='p-4 sm:p-5'>
          {statusLoading ? (
            <div className='py-8 flex justify-center'>
              <Spin size='large' />
            </div>
          ) : enableOnlineTopUp || enableStripeTopUp || enableCreemTopUp || enableWaffoTopUp ? (
            <Form
              getFormApi={(api) => (onlineFormApiRef.current = api)}
              initValues={{ topUpCount: topUpCount }}
            >
              <div className='space-y-5'>
                {(enableOnlineTopUp || enableStripeTopUp || enableWaffoTopUp) && (
                  <Row gutter={12}>
                    <Col xs={24} sm={24} md={24} lg={10} xl={10}>
                      <Form.InputNumber
                        field='topUpCount'
                        label={t('充值数量')}
                        disabled={!enableOnlineTopUp && !enableStripeTopUp && !enableWaffoTopUp}
                        placeholder={
                          t('充值数量，最低 ') + renderQuotaWithAmount(minTopUp)
                        }
                        value={topUpCount}
                        min={minTopUp}
                        max={999999999}
                        step={1}
                        precision={0}
                        onChange={async (value) => {
                          if (value && value >= 1) {
                            setTopUpCount(value);
                            setSelectedPreset(null);
                            await getAmount(value);
                          }
                        }}
                        onBlur={(e) => {
                          const value = parseInt(e.target.value);
                          if (!value || value < 1) {
                            setTopUpCount(1);
                            getAmount(1);
                          }
                        }}
                        formatter={(value) => (value ? `${value}` : '')}
                        parser={(value) =>
                          value ? parseInt(value.replace(/[^\d]/g, '')) : 0
                        }
                        extraText={
                          <Skeleton
                            loading={showAmountSkeleton}
                            active
                            placeholder={
                              <Skeleton.Title
                                style={{
                                  width: 120,
                                  height: 20,
                                  borderRadius: 6,
                                }}
                              />
                            }
                          >
                            <Text type='secondary' className='text-red-600'>
                              {t('实付金额：')}
                              <span style={{ color: 'var(--hp-accent)' }}>
                                {renderAmount()}
                              </span>
                            </Text>
                          </Skeleton>
                        }
                        style={{ width: '100%' }}
                      />
                    </Col>
                    {payMethods && payMethods.filter(m => m.type !== 'waffo').length > 0 && (
                    <Col xs={24} sm={24} md={24} lg={14} xl={14}>
                      <Form.Slot label={t('选择支付方式')}>
                          <div className='flex flex-wrap gap-2'>
                            {payMethods.filter(m => m.type !== 'waffo').map((payMethod) => {
                              const minTopupVal = Number(payMethod.min_topup) || 0;
                              const isStripe = payMethod.type === 'stripe';
                              const disabled =
                                (!enableOnlineTopUp && !isStripe) ||
                                (!enableStripeTopUp && isStripe) ||
                                minTopupVal > Number(topUpCount || 0);

                              const buttonEl = (
                                <button
                                  key={payMethod.type}
                                  onClick={() => !disabled && preTopUp(payMethod.type)}
                                  disabled={disabled}
                                  className='topup-pay-method-btn'
                                  style={{
                                    opacity: disabled ? 0.45 : 1,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  <span className='topup-pay-method-icon'>
                                    {payMethod.type === 'alipay' ? (
                                      <SiAlipay size={16} color='#1677FF' />
                                    ) : payMethod.type === 'wxpay' ? (
                                      <SiWechat size={16} color='#07C160' />
                                    ) : payMethod.type === 'stripe' ? (
                                      <SiStripe size={16} color='#635BFF' />
                                    ) : (
                                      <CreditCard
                                        size={16}
                                        color={payMethod.color || 'var(--hp-sub)'}
                                      />
                                    )}
                                  </span>
                                  <span style={{ color: 'var(--hp-text)', fontSize: '13px', fontWeight: 500 }}>
                                    {payMethod.name}
                                  </span>
                                  {paymentLoading && payWay === payMethod.type && (
                                    <Spin size='small' />
                                  )}
                                </button>
                              );

                              return disabled &&
                                minTopupVal > Number(topUpCount || 0) ? (
                                <Tooltip
                                  content={
                                    t('此支付方式最低充值金额为') +
                                    ' ' +
                                    minTopupVal
                                  }
                                  key={payMethod.type}
                                >
                                  {buttonEl}
                                </Tooltip>
                              ) : (
                                <React.Fragment key={payMethod.type}>
                                  {buttonEl}
                                </React.Fragment>
                              );
                            })}
                          </div>
                      </Form.Slot>
                    </Col>
                    )}
                  </Row>
                )}

                {(enableOnlineTopUp || enableStripeTopUp || enableWaffoTopUp) && (
                  <Form.Slot
                    label={
                      <div className='flex items-center gap-2'>
                        <span>{t('选择充值额度')}</span>
                        {(() => {
                          const { symbol, rate, type } = getCurrencyConfig();
                          if (type === 'USD') return null;

                          return (
                            <span
                              style={{
                                color: 'var(--hp-sub)',
                                fontSize: '12px',
                                fontWeight: 'normal',
                              }}
                            >
                              (1 $ = {rate.toFixed(2)} {symbol})
                            </span>
                          );
                        })()}
                      </div>
                    }
                  >
                    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
                      {presetAmounts.map((preset, index) => {
                        const discount =
                          preset.discount || topupInfo?.discount?.[preset.value] || 1.0;
                        const originalPrice = preset.value * priceRatio;
                        const discountedPrice = originalPrice * discount;
                        const hasDiscount = discount < 1.0;
                        const actualPay = discountedPrice;
                        const save = originalPrice - discountedPrice;

                        const { symbol, rate, type } = getCurrencyConfig();
                        const statusStr = localStorage.getItem('status');
                        let usdRate = 7;
                        try {
                          if (statusStr) {
                            const s = JSON.parse(statusStr);
                            usdRate = s?.usd_exchange_rate || 7;
                          }
                        } catch (e) { }

                        let displayValue = preset.value;
                        let displayActualPay = actualPay;
                        let displaySave = save;

                        if (type === 'USD') {
                          displayActualPay = actualPay / usdRate;
                          displaySave = save / usdRate;
                        } else if (type === 'CNY') {
                          displayValue = preset.value * usdRate;
                        } else if (type === 'CUSTOM') {
                          displayValue = preset.value * rate;
                          displayActualPay = (actualPay / usdRate) * rate;
                          displaySave = (save / usdRate) * rate;
                        }

                        const isSelected = selectedPreset === preset.value;

                        return (
                          <div
                            key={index}
                            className='topup-preset-card'
                            data-selected={isSelected}
                            onClick={() => {
                              selectPresetAmount(preset);
                              onlineFormApiRef.current?.setValue(
                                'topUpCount',
                                preset.value,
                              );
                            }}
                          >
                            <div style={{ textAlign: 'center' }}>
                              <div className='flex items-center justify-center gap-1.5 mb-2'>
                                <Coins size={15} style={{ color: isSelected ? 'var(--hp-accent)' : 'var(--hp-sub)' }} />
                                <span
                                  className='text-base font-bold'
                                  style={{ color: 'var(--hp-text)' }}
                                >
                                  {formatLargeNumber(displayValue)} {symbol}
                                </span>
                                {hasDiscount && (
                                  <Tag
                                    style={{
                                      marginLeft: 2,
                                      borderRadius: '8px',
                                      background: 'rgba(var(--hp-accent-rgb), 0.12)',
                                      color: 'var(--hp-accent)',
                                      border: 'none',
                                    }}
                                    size='small'
                                  >
                                    {t('折').includes('off')
                                      ? ((1 - parseFloat(discount)) * 100).toFixed(1)
                                      : (discount * 10).toFixed(1)}
                                    {t('折')}
                                  </Tag>
                                )}
                              </div>
                              <div
                                style={{
                                  color: 'var(--hp-sub)',
                                  fontSize: '11px',
                                  lineHeight: '1.4',
                                }}
                              >
                                {t('实付')} {symbol}
                                {displayActualPay.toFixed(2)}
                                {hasDiscount
                                  ? ` · ${t('节省')} ${symbol}${displaySave.toFixed(2)}`
                                  : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Form.Slot>
                )}

                {/* Waffo 充值区域 */}
                {enableWaffoTopUp &&
                  waffoPayMethods &&
                  waffoPayMethods.length > 0 && (
                    <Form.Slot label={t('Waffo 充值')}>
                      <div className='flex flex-wrap gap-2'>
                        {waffoPayMethods.map((method, index) => (
                          <button
                            key={index}
                            onClick={() => waffoTopUp(index)}
                            disabled={paymentLoading}
                            className='topup-pay-method-btn'
                          >
                            <span className='topup-pay-method-icon'>
                              {method.icon ? (
                                <img
                                  src={method.icon}
                                  alt={method.name}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    objectFit: 'contain',
                                  }}
                                />
                              ) : (
                                <CreditCard
                                  size={16}
                                  color='var(--hp-sub)'
                                />
                              )}
                            </span>
                            <span style={{ color: 'var(--hp-text)', fontSize: '13px', fontWeight: 500 }}>
                              {method.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Form.Slot>
                  )}

                {/* Creem 充值区域 */}
                {enableCreemTopUp && creemProducts.length > 0 && (
                  <Form.Slot label={t('Creem 充值')}>
                    <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'>
                      {creemProducts.map((product, index) => (
                        <div
                          key={index}
                          onClick={() => creemPreTopUp(product)}
                          className='topup-creem-card'
                        >
                          <div
                            className='font-semibold text-base mb-1.5'
                            style={{ color: 'var(--hp-text)' }}
                          >
                            {product.name}
                          </div>
                          <div
                            className='text-xs mb-2'
                            style={{ color: 'var(--hp-sub)' }}
                          >
                            {t('充值额度')}: {product.quota}
                          </div>
                          <div
                            className='text-lg font-bold'
                            style={{ color: 'var(--hp-accent)' }}
                          >
                            {product.currency === 'EUR' ? '€' : '$'}
                            {product.price}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Form.Slot>
                )}
              </div>
            </Form>
          ) : (
            <Banner
              type='info'
              description={t(
                '管理员未开启在线充值功能，请联系管理员开启或使用兑换码充值。',
              )}
              className='!rounded-xl'
              closeIcon={null}
            />
          )}
        </div>
      </div>

      {/* 兑换码充值 */}
      <div
        className='!rounded-2xl overflow-hidden p-4 sm:p-5'
        style={{
          background: 'var(--hp-bg-soft)',
          boxShadow: 'var(--hp-shadow)',
        }}
      >
        <Text
          strong
          className='text-xs mb-3 block'
          style={{ color: 'var(--hp-sub)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {t('兑换码充值')}
        </Text>
        <Form
          getFormApi={(api) => (redeemFormApiRef.current = api)}
          initValues={{ redemptionCode: redemptionCode }}
        >
          <div
            className='flex items-center gap-2 rounded-xl px-3 py-1.5'
            style={{
              border: '1.5px solid var(--hp-border)',
              background: 'var(--hp-card)',
            }}
          >
            <IconGift style={{ color: 'var(--hp-sub)', fontSize: 16, flexShrink: 0 }} />
            <input
              placeholder={t('请输入兑换码')}
              value={redemptionCode}
              onChange={(e) => setRedemptionCode(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--hp-text)',
                fontSize: '13px',
                minWidth: 0,
                padding: '8px 0',
              }}
            />
            <Button
              type='primary'
              theme='solid'
              onClick={topUp}
              loading={isSubmitting}
              className='!rounded-lg'
              style={{
                background: 'var(--hp-accent)',
                borderColor: 'var(--hp-accent)',
                flexShrink: 0,
              }}
            >
              {t('兑换额度')}
            </Button>
          </div>
          {topUpLink && (
            <div className='mt-2 ml-1'>
              <Text style={{ color: 'var(--hp-sub)', fontSize: '12px' }}>
                {t('在找兑换码？')}
                <Text
                  underline
                  className='cursor-pointer ml-1'
                  style={{ color: 'var(--hp-accent)', fontSize: '12px' }}
                  onClick={openTopUpLink}
                >
                  {t('购买兑换码')}
                </Text>
              </Text>
            </div>
          )}
        </Form>
      </div>
    </div>
  );

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
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center'>
            <div
              className='w-10 h-10 rounded-2xl flex items-center justify-center mr-3'
              style={{
                background: 'rgba(var(--hp-accent-rgb), 0.12)',
              }}
            >
              <CreditCard size={18} style={{ color: 'var(--hp-accent)' }} />
            </div>
            <div>
              <Typography.Text
                className='text-lg font-semibold'
                style={{ color: 'var(--hp-text)' }}
              >
                {t('账户充值')}
              </Typography.Text>
              <div className='text-xs' style={{ color: 'var(--hp-sub)' }}>
                {t('多种充值方式，安全便捷')}
              </div>
            </div>
          </div>
          <button
            onClick={onOpenHistory}
            className='topup-history-btn'
          >
            <Receipt size={14} />
            <span>{t('账单')}</span>
          </button>
        </div>

        {shouldShowSubscription ? (
          <div className='topup-tabs-wrapper'>
            <Tabs type='card' activeKey={activeTab} onChange={setActiveTab}>
              <TabPane
                tab={
                  <div className='flex items-center gap-1.5'>
                    <Sparkles size={14} />
                    {t('订阅套餐')}
                  </div>
                }
                itemKey='subscription'
              >
                <div className='pt-4'>
                  <SubscriptionPlansCard
                    t={t}
                    loading={subscriptionLoading}
                    plans={subscriptionPlans}
                    payMethods={payMethods}
                    enableOnlineTopUp={enableOnlineTopUp}
                    enableStripeTopUp={enableStripeTopUp}
                    enableCreemTopUp={enableCreemTopUp}
                    billingPreference={billingPreference}
                    onChangeBillingPreference={onChangeBillingPreference}
                    activeSubscriptions={activeSubscriptions}
                    allSubscriptions={allSubscriptions}
                    reloadSubscriptionSelf={reloadSubscriptionSelf}
                    withCard={false}
                  />
                </div>
              </TabPane>
              <TabPane
                tab={
                  <div className='flex items-center gap-1.5'>
                    <Wallet size={14} />
                    {t('额度充值')}
                  </div>
                }
                itemKey='topup'
              >
                <div className='pt-4'>{topupContent}</div>
              </TabPane>
            </Tabs>
          </div>
        ) : (
          topupContent
        )}
      </div>
    </div>
  );
};

export default RechargeCard;
