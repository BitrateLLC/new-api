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
import { Modal, Typography, Card, Skeleton } from '@douyinfe/semi-ui';
import { SiAlipay, SiWechat, SiStripe } from 'react-icons/si';
import { CreditCard } from 'lucide-react';

const { Text } = Typography;

const PaymentConfirmModal = ({
  t,
  open,
  onlineTopUp,
  handleCancel,
  confirmLoading,
  topUpCount,
  renderQuotaWithAmount,
  amountLoading,
  renderAmount,
  payWay,
  payMethods,
  // 新增：用于显示折扣明细
  amountNumber,
  discountRate,
}) => {
  const hasDiscount =
    discountRate && discountRate > 0 && discountRate < 1 && amountNumber > 0;
  const originalAmount = hasDiscount ? amountNumber / discountRate : 0;
  const discountAmount = hasDiscount ? originalAmount - amountNumber : 0;
  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--hp-border)',
  };
  const lastRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
  };

  const payMethod = payMethods.find((m) => m.type === payWay);
  const payIcon =
    payWay === 'alipay' ? <SiAlipay size={15} color='#1677FF' /> :
    payWay === 'wxpay'  ? <SiWechat size={15} color='#07C160' /> :
    payWay === 'stripe' ? <SiStripe size={15} color='#635BFF' /> :
    <CreditCard size={15} color={payMethod?.color || 'var(--hp-sub)'} />;
  const payName = payMethod?.name || (payWay === 'alipay' ? t('支付宝') : payWay === 'stripe' ? 'Stripe' : t('微信'));

  return (
    <Modal
      title={
        <div className='flex items-center gap-2'>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(var(--hp-accent-rgb), 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CreditCard size={14} style={{ color: 'var(--hp-accent)' }} />
          </div>
          <span style={{ color: 'var(--hp-text)', fontWeight: 600 }}>{t('充值确认')}</span>
        </div>
      }
      visible={open}
      onOk={onlineTopUp}
      onCancel={handleCancel}
      maskClosable={false}
      size='small'
      centered
      confirmLoading={confirmLoading}
      okButtonProps={{
        style: {
          background: 'var(--hp-accent)',
          borderColor: 'var(--hp-accent)',
          borderRadius: 10,
        },
      }}
      cancelButtonProps={{ style: { borderRadius: 10 } }}
    >
      <div
        style={{
          borderRadius: 14,
          border: '1.5px solid var(--hp-border)',
          background: 'var(--hp-bg-soft)',
          padding: '4px 16px',
          marginTop: 4,
        }}
      >
        {/* 充值数量 */}
        <div style={rowStyle}>
          <Text style={{ color: 'var(--hp-sub)', fontSize: 13 }}>{t('充值数量')}</Text>
          <Text strong style={{ color: 'var(--hp-text)', fontSize: 13 }}>
            {renderQuotaWithAmount(topUpCount)}
          </Text>
        </div>

        {/* 原价（有折扣时显示） */}
        {hasDiscount && !amountLoading && (
          <div style={rowStyle}>
            <Text style={{ color: 'var(--hp-sub)', fontSize: 13 }}>{t('原价')}</Text>
            <Text delete style={{ color: 'var(--hp-muted)', fontSize: 13 }}>
              {`${originalAmount.toFixed(2)} ${t('元')}`}
            </Text>
          </div>
        )}

        {/* 优惠（有折扣时显示） */}
        {hasDiscount && !amountLoading && (
          <div style={rowStyle}>
            <Text style={{ color: 'var(--hp-sub)', fontSize: 13 }}>{t('优惠')}</Text>
            <Text style={{ color: '#22c55e', fontSize: 13 }}>
              {`- ${discountAmount.toFixed(2)} ${t('元')}`}
            </Text>
          </div>
        )}

        {/* 支付方式 */}
        <div style={rowStyle}>
          <Text style={{ color: 'var(--hp-sub)', fontSize: 13 }}>{t('支付方式')}</Text>
          <div className='flex items-center gap-1.5'>
            {payIcon}
            <Text style={{ color: 'var(--hp-text)', fontSize: 13 }}>{payName}</Text>
          </div>
        </div>

        {/* 实付金额 */}
        <div style={lastRowStyle}>
          <Text strong style={{ color: 'var(--hp-text)', fontSize: 13 }}>{t('实付金额')}</Text>
          {amountLoading ? (
            <Skeleton.Title style={{ width: 60, height: 16 }} />
          ) : (
            <div className='flex items-baseline gap-1.5'>
              <Text strong style={{ color: 'var(--hp-accent)', fontSize: 20, lineHeight: 1 }}>
                {renderAmount()}
              </Text>
              {hasDiscount && (
                <Text style={{ color: 'var(--hp-accent)', fontSize: 11, opacity: 0.8 }}>
                  {Math.round(discountRate * 100)}% off
                </Text>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PaymentConfirmModal;
