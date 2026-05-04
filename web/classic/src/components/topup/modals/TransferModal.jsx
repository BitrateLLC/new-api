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
import { Modal, Typography, Input, InputNumber } from '@douyinfe/semi-ui';
import { CreditCard } from 'lucide-react';

const TransferModal = ({
  t,
  openTransfer,
  transfer,
  handleTransferCancel,
  userState,
  renderQuota,
  getQuotaPerUnit,
  transferAmount,
  setTransferAmount,
}) => {
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
          <span style={{ color: 'var(--hp-text)', fontWeight: 600 }}>{t('划转邀请额度')}</span>
        </div>
      }
      visible={openTransfer}
      onOk={transfer}
      onCancel={handleTransferCancel}
      maskClosable={false}
      centered
      okButtonProps={{
        style: {
          background: 'var(--hp-accent)',
          borderColor: 'var(--hp-accent)',
          borderRadius: 10,
        },
      }}
      cancelButtonProps={{ style: { borderRadius: 10 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
        <div>
          <Typography.Text
            style={{ color: 'var(--hp-sub)', fontSize: 12, display: 'block', marginBottom: 8 }}
          >
            {t('可用邀请额度')}
          </Typography.Text>
          <Input
            value={renderQuota(userState?.user?.aff_quota)}
            disabled
            style={{ borderRadius: 10 }}
          />
        </div>
        <div>
          <Typography.Text
            style={{ color: 'var(--hp-sub)', fontSize: 12, display: 'block', marginBottom: 8 }}
          >
            {t('划转额度')}
            <span style={{ color: 'var(--hp-muted)', marginLeft: 6 }}>
              · {t('最低')}{renderQuota(getQuotaPerUnit())}
            </span>
          </Typography.Text>
          <InputNumber
            min={getQuotaPerUnit()}
            max={userState?.user?.aff_quota || 0}
            value={transferAmount}
            onChange={(value) => setTransferAmount(value)}
            style={{ width: '100%', borderRadius: 10 }}
          />
        </div>
      </div>
    </Modal>
  );
};

export default TransferModal;
