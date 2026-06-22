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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Select,
  Table,
  Tag,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { Copy, RefreshCw, Search } from 'lucide-react';
import CardPro from '../../components/common/ui/CardPro';
import { API, copy, showError } from '../../helpers';
import { createCardProPagination, timestamp2string } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

const statusColor = {
  SUCCESS: 'green',
  FAILURE: 'red',
  QUEUED: 'blue',
  IN_PROGRESS: 'orange',
};

const hasImageUrls = (urls) =>
  Array.isArray(urls) && urls.some((url) => typeof url === 'string' && url);

const getDisplayStatus = (record, t) => {
  if (
    record?.storage_status === 'FAILED' ||
    (record?.status === 'SUCCESS' &&
      !hasImageUrls(record.image_urls) &&
      record?.error)
  ) {
    return {
      label: t('留存失败'),
      color: 'orange',
      title: record.error,
    };
  }
  return {
    label: record?.status || '-',
    color: statusColor[record?.status] || 'grey',
    title: record?.error || '',
  };
};

const shortenText = (value, head = 12, tail = 8) => {
  if (!value || value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const copyTaskId = async (value, t) => {
  if (!value) return;
  const ok = await copy(value);
  if (ok) {
    Toast.success(t('已复制任务 ID'));
  } else {
    Toast.error(t('复制失败'));
  }
};

const ImageLog = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [filters, setFilters] = useState({
    token_id: '',
    task_id: '',
    model: '',
    status: '',
  });

  const tokenOptions = useMemo(
    () =>
      tokens.map((token) => ({
        label: token.name || `#${token.id}`,
        value: String(token.id),
      })),
    [tokens],
  );

  const loadTokens = useCallback(async () => {
    try {
      const res = await API.get('/api/token/', {
        params: { p: 1, size: 100 },
        disableDuplicate: true,
      });
      const data = res.data?.data || {};
      const items = Array.isArray(data) ? data : data.items || [];
      setTokens(items);
    } catch (error) {
      Toast.warning(t('加载令牌失败'));
    }
  }, [t]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        p: page,
        page_size: pageSize,
      };
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params[key] = value;
        }
      });
      const res = await API.get('/api/image/logs', {
        params,
        disableDuplicate: true,
      });
      const data = res.data?.data || {};
      setLogs(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total || 0));
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value || '' }));
    setPage(1);
  };

  const columns = useMemo(
    () => [
      {
        title: t('时间'),
        dataIndex: 'created_at',
        width: 180,
        render: (value) => (
          <span className='block whitespace-nowrap text-xs tabular-nums'>
            {timestamp2string(value)}
          </span>
        ),
      },
      {
        title: t('API Key'),
        dataIndex: 'token_name',
        width: 150,
        render: (value, record) => {
          const tokenName =
            value || (record.token_id ? `#${record.token_id}` : t('网页操练场'));
          return (
            <Text
              ellipsis={{ showTooltip: true }}
              className='block whitespace-nowrap'
              style={{ maxWidth: 128 }}
            >
              {tokenName}
            </Text>
          );
        },
      },
      {
        title: t('模型'),
        dataIndex: 'model',
        width: 140,
        render: (value) => (
          <Text
            ellipsis={{ showTooltip: true }}
            className='block whitespace-nowrap'
            style={{ maxWidth: 118 }}
          >
            {value || '-'}
          </Text>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        width: 100,
        render: (value, record) => {
          const status = getDisplayStatus(record, t);
          return (
            <Tag color={status.color} size='small' title={status.title}>
              {status.label}
            </Tag>
          );
        },
      },
      {
        title: t('图片'),
        dataIndex: 'image_urls',
        width: 120,
        render: (urls) => {
          if (!Array.isArray(urls) || urls.length === 0) return '-';
          return (
            <div className='flex h-10 items-center gap-1 overflow-hidden whitespace-nowrap'>
              {urls.slice(0, 3).map((url, index) => (
                <a
                  key={`${url}-${index}`}
                  href={url}
                  target='_blank'
                  rel='noreferrer'
                >
                  <img
                    src={url}
                    alt=''
                    className='h-10 w-10 rounded object-cover'
                  />
                </a>
              ))}
              {urls.length > 3 && (
                <Text type='tertiary' size='small'>
                  +{urls.length - 3}
                </Text>
              )}
            </div>
          );
        },
      },
      {
        title: t('Prompt'),
        dataIndex: 'prompt',
        render: (value) => (
          <Text
            ellipsis={{ showTooltip: true }}
            className='block whitespace-nowrap'
            style={{ maxWidth: '100%' }}
          >
            {value || '-'}
          </Text>
        ),
      },
      {
        title: t('任务 ID'),
        dataIndex: 'task_id',
        width: 220,
        render: (value) => (
          <Button
            size='small'
            theme='borderless'
            type='tertiary'
            icon={<Copy size={13} />}
            className='max-w-full font-mono'
            title={value}
            onClick={() => {
              void copyTaskId(value, t);
            }}
          >
            <span className='block max-w-[170px] truncate'>
              {shortenText(value)}
            </span>
          </Button>
        ),
      },
    ],
    [t],
  );

  const statsArea = (
    <div className='flex flex-col gap-1'>
      <Text strong>{t('生图日志')}</Text>
      <Text type='tertiary' size='small'>
        {t('查看当前用户下所有 API Key 与网页操练场产生的生图记录')}
      </Text>
    </div>
  );

  const searchArea = (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='w-full sm:w-52'>
        <Text className='mb-1 block text-xs' type='tertiary'>
          {t('API Key')}
        </Text>
        <Select
          value={filters.token_id}
          optionList={tokenOptions}
          placeholder={t('全部 API Key 或输入 ID')}
          showClear
          filter
          allowCreate
          autoClearSearchValue={false}
          onChange={(value) => updateFilter('token_id', value)}
          style={{ width: '100%' }}
        />
      </div>
      <div className='w-full sm:w-52'>
        <Text className='mb-1 block text-xs' type='tertiary'>
          {t('状态')}
        </Text>
        <Select
          value={filters.status}
          placeholder={t('全部状态')}
          showClear
          optionList={[
            { label: 'SUCCESS', value: 'SUCCESS' },
            { label: 'FAILURE', value: 'FAILURE' },
            { label: 'QUEUED', value: 'QUEUED' },
            { label: 'IN_PROGRESS', value: 'IN_PROGRESS' },
          ]}
          onChange={(value) => updateFilter('status', value)}
          style={{ width: '100%' }}
        />
      </div>
      <div className='w-full sm:w-56'>
        <Text className='mb-1 block text-xs' type='tertiary'>
          {t('模型')}
        </Text>
        <Input
          value={filters.model}
          placeholder='gpt-image-1'
          onChange={(value) => updateFilter('model', value)}
        />
      </div>
      <div className='w-full sm:w-64'>
        <Text className='mb-1 block text-xs' type='tertiary'>
          {t('任务 ID')}
        </Text>
        <Input
          value={filters.task_id}
          placeholder='task_xxx'
          onChange={(value) => updateFilter('task_id', value)}
        />
      </div>
      <Button icon={<Search size={14} />} onClick={loadLogs}>
        {t('查询')}
      </Button>
      <Button
        icon={<RefreshCw size={14} />}
        theme='borderless'
        onClick={loadLogs}
      />
    </div>
  );

  return (
    <div className='mt-[60px] px-2'>
      <CardPro
        type='type2'
        statsArea={statsArea}
        searchArea={searchArea}
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          },
          isMobile,
          t,
        })}
        t={t}
      >
        <Table
          columns={columns}
          dataSource={logs}
          rowKey='id'
          loading={loading}
          pagination={false}
          size='small'
          scroll={isMobile ? { x: 1100 } : undefined}
          className='w-full'
        />
      </CardPro>
    </div>
  );
};

export default ImageLog;
