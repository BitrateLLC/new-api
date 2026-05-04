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
  Modal,
  Table,
  Badge,
  Typography,
  Toast,
  Empty,
  Button,
  Input,
  Tag,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Coins } from 'lucide-react';
import { IconSearch } from '@douyinfe/semi-icons';
import { API, timestamp2string } from '../../../helpers';
import { isAdmin } from '../../../helpers/utils';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const { Text } = Typography;

// 状态映射配置
const STATUS_CONFIG = {
  success: { type: 'success', key: '成功' },
  pending: { type: 'warning', key: '待支付' },
  failed: { type: 'danger', key: '失败' },
  expired: { type: 'danger', key: '已过期' },
};

// 状态标签样式映射 — 使用语义色，暗色模式下透明度自然适配
const STATUS_STYLE = {
  success: {
    background: 'rgba(52, 199, 89, 0.12)',
    color: '#34c759',
    border: '1px solid rgba(52, 199, 89, 0.25)',
  },
  pending: {
    background: 'rgba(255, 159, 10, 0.12)',
    color: '#ff9f0a',
    border: '1px solid rgba(255, 159, 10, 0.25)',
  },
  failed: {
    background: 'rgba(255, 59, 48, 0.12)',
    color: '#ff3b30',
    border: '1px solid rgba(255, 59, 48, 0.25)',
  },
  expired: {
    background: 'rgba(255, 59, 48, 0.08)',
    color: '#ff3b30',
    border: '1px solid rgba(255, 59, 48, 0.18)',
  },
};

// 支付方式映射
const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  creem: 'Creem',
  waffo: 'Waffo',
  alipay: '支付宝',
  wxpay: '微信',
};

// ─── CSS 注入 ────────────────────────────────────────────────────────────────
const INJECTED_STYLES = `
  /* Modal 容器 */
  .topup-history-modal .semi-modal-content {
    border-radius: 16px !important;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08) !important;
  }

  .topup-history-modal .semi-modal-header {
    padding: 22px 24px 0 24px !important;
    border-bottom: none !important;
    background: transparent !important;
  }

  .topup-history-modal .semi-modal-title {
    font-size: 17px !important;
    font-weight: 600 !important;
    letter-spacing: -0.02em !important;
    color: var(--hp-text, var(--semi-color-text-0)) !important;
  }

  .topup-history-modal .semi-modal-body {
    padding: 16px 24px 24px 24px !important;
  }

  .topup-history-modal .semi-modal-footer {
    border-top: none !important;
    padding: 0 !important;
  }

  /* 搜索框 */
  .topup-history-modal .semi-input-wrapper {
    border-radius: 10px !important;
    background: var(--hp-surface-2, var(--semi-color-fill-0)) !important;
    transition: all 0.2s ease !important;
  }

  .topup-history-modal .semi-input-wrapper:focus-within {
    box-shadow: 0 0 0 3px var(--hp-focus-ring, rgba(0, 122, 255, 0.15)) !important;
    border-color: var(--hp-primary, #007aff) !important;
  }

  /* 表头 */
  .topup-history-modal .semi-table-thead th {
    font-size: 11px !important;
    font-weight: 600 !important;
    letter-spacing: 0.04em !important;
    text-transform: uppercase !important;
    color: var(--hp-sub, var(--semi-color-text-2)) !important;
    background: transparent !important;
    border-bottom: 1px solid var(--hp-border, var(--semi-color-border)) !important;
    padding: 8px 12px !important;
  }

  /* 表格行 */
  .topup-history-modal .semi-table-tbody .semi-table-row {
    transition: background-color 0.2s ease !important;
  }

  .topup-history-modal .semi-table-tbody .semi-table-row:hover td {
    background-color: var(--hp-surface-hover, rgba(0, 122, 255, 0.04)) !important;
  }

  .topup-history-modal .semi-table-tbody td {
    border-bottom: 1px solid var(--hp-border, var(--semi-color-border)) !important;
    padding: 11px 12px !important;
    transition: background-color 0.2s ease !important;
  }

  /* 最后一行去掉底线 */
  .topup-history-modal .semi-table-tbody .semi-table-row:last-child td {
    border-bottom: none !important;
  }

  /* 分页 */
  .topup-history-modal .semi-page-item {
    border-radius: 8px !important;
    transition: all 0.2s ease !important;
  }

  /* 所有按钮 */
  .topup-history-modal .semi-button {
    transition: all 0.2s ease !important;
  }

  /* 暗色模式 hover */
  [data-theme='dark'] .topup-history-modal .semi-table-tbody .semi-table-row:hover td,
  .semi-always-dark .topup-history-modal .semi-table-tbody .semi-table-row:hover td {
    background-color: var(--hp-surface-hover, rgba(255, 255, 255, 0.05)) !important;
  }
`;

// ─── 子组件：状态标签 ─────────────────────────────────────────────────────────
const StatusTag = ({ status, label }) => {
  const tagStyle = STATUS_STYLE[status] || {
    background: 'var(--hp-surface-2, rgba(0,0,0,0.06))',
    color: 'var(--hp-text, var(--semi-color-text-0))',
    border: '1px solid var(--hp-border, rgba(0,0,0,0.1))',
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 9px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        transition: 'all 0.2s ease',
        ...tagStyle,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: tagStyle.color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
};

// ─── 主组件 ───────────────────────────────────────────────────────────────────
const TopupHistoryModal = ({ visible, onCancel, t }) => {
  const [loading, setLoading] = useState(false);
  const [topups, setTopups] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const isMobile = useIsMobile();

  const loadTopups = async (currentPage, currentPageSize) => {
    setLoading(true);
    try {
      const base = isAdmin() ? '/api/user/topup' : '/api/user/topup/self';
      const qs =
        `p=${currentPage}&page_size=${currentPageSize}` +
        (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '');
      const res = await API.get(`${base}?${qs}`);
      const { success, message, data } = res.data;
      if (success) {
        setTopups(data.items || []);
        setTotal(data.total || 0);
      } else {
        Toast.error({ content: message || t('加载失败') });
      }
    } catch {
      Toast.error({ content: t('加载账单失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) loadTopups(page, pageSize);
  }, [visible, page, pageSize, keyword]);

  const handlePageChange = (p) => setPage(p);
  const handlePageSizeChange = (ps) => { setPageSize(ps); setPage(1); };
  const handleKeywordChange = (v) => { setKeyword(v); setPage(1); };

  // 管理员补单
  const handleAdminComplete = async (tradeNo) => {
    try {
      const res = await API.post('/api/user/topup/complete', { trade_no: tradeNo });
      const { success, message } = res.data;
      if (success) {
        Toast.success({ content: t('补单成功') });
        await loadTopups(page, pageSize);
      } else {
        Toast.error({ content: message || t('补单失败') });
      }
    } catch {
      Toast.error({ content: t('补单失败') });
    }
  };

  const confirmAdminComplete = (tradeNo) => {
    Modal.confirm({
      title: t('确认补单'),
      content: t('是否将该订单标记为成功并为用户入账？'),
      onOk: () => handleAdminComplete(tradeNo),
    });
  };

  const isSubscriptionTopup = (record) => {
    const tradeNo = (record?.trade_no || '').toLowerCase();
    return Number(record?.amount || 0) === 0 && tradeNo.startsWith('sub');
  };

  const userIsAdmin = useMemo(() => isAdmin(), []);

  const columns = useMemo(() => {
    const cols = [
      {
        title: t('订单号'),
        dataIndex: 'trade_no',
        key: 'trade_no',
        render: (text) => (
          <Text
            copyable
            style={{
              fontSize: '12px',
              fontFamily: 'ui-monospace, "SF Mono", "Menlo", monospace',
              color: 'var(--hp-sub, var(--semi-color-text-2))',
            }}
          >
            {text}
          </Text>
        ),
      },
      {
        title: t('支付方式'),
        dataIndex: 'payment_method',
        key: 'payment_method',
        render: (pm) => {
          const displayName = PAYMENT_METHOD_MAP[pm];
          return (
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--hp-text, var(--semi-color-text-0))',
              }}
            >
              {displayName ? t(displayName) : pm || '—'}
            </span>
          );
        },
      },
      {
        title: t('充值额度'),
        dataIndex: 'amount',
        key: 'amount',
        render: (amount, record) => {
          if (isSubscriptionTopup(record)) {
            return (
              <Tag
                color='purple'
                shape='circle'
                size='small'
                style={{ borderRadius: '6px', transition: 'all 0.2s ease' }}
              >
                {t('订阅套餐')}
              </Tag>
            );
          }
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Coins
                size={14}
                style={{
                  color: 'var(--hp-sub, var(--semi-color-text-2))',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                  color: 'var(--hp-text, var(--semi-color-text-0))',
                }}
              >
                {amount}
              </span>
            </span>
          );
        },
      },
      {
        title: t('支付金额'),
        dataIndex: 'money',
        key: 'money',
        render: (money) => (
          <span
            style={{
              fontWeight: 700,
              fontSize: '14px',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              color: '#ff3b30',
            }}
          >
            ¥{money.toFixed(2)}
          </span>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: (status) => {
          const config = STATUS_CONFIG[status] || { key: status };
          return <StatusTag status={status} label={t(config.key)} />;
        },
      },
    ];

    if (userIsAdmin) {
      cols.push({
        title: t('操作'),
        key: 'action',
        render: (_, record) =>
          record.status === 'pending' ? (
            <Button
              size='small'
              type='primary'
              theme='outline'
              style={{
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onClick={() => confirmAdminComplete(record.trade_no)}
            >
              {t('补单')}
            </Button>
          ) : null,
      });
    }

    cols.push({
      title: t('创建时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      render: (time) => (
        <span
          style={{
            fontSize: '12px',
            color: 'var(--hp-sub, var(--semi-color-text-2))',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {timestamp2string(time)}
        </span>
      ),
    });

    return cols;
  }, [t, userIsAdmin]);

  return (
    <>
      <style>{INJECTED_STYLES}</style>
      <Modal
        className='topup-history-modal'
        title={t('充值账单')}
        visible={visible}
        onCancel={onCancel}
        footer={null}
        size={isMobile ? 'full-width' : 'large'}
      >
        {/* 搜索框 */}
        <div style={{ marginBottom: 16 }}>
          <Input
            prefix={
              <IconSearch
                style={{ color: 'var(--hp-sub, var(--semi-color-text-2))' }}
              />
            }
            placeholder={t('订单号')}
            value={keyword}
            onChange={handleKeywordChange}
            showClear
          />
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={topups}
          loading={loading}
          rowKey='id'
          pagination={{
            currentPage: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOpts: [10, 20, 50, 100],
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange,
          }}
          size='small'
          empty={
            <Empty
              image={<IllustrationNoResult style={{ width: 140, height: 140 }} />}
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 140, height: 140 }} />
              }
              description={
                <span
                  style={{
                    color: 'var(--hp-sub, var(--semi-color-text-2))',
                    fontSize: '13px',
                  }}
                >
                  {t('暂无充值记录')}
                </span>
              }
              style={{ padding: '28px 0' }}
            />
          }
        />
      </Modal>
    </>
  );
};

export default TopupHistoryModal;
