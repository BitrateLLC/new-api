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
  Tag,
  Checkbox,
  Empty,
  Pagination,
  Avatar,
} from '@douyinfe/semi-ui';
import { Copy } from 'lucide-react';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import {
  calculateModelPrice,
  formatPriceInfo,
  getLobeHubIcon,
} from '../../../../../helpers';
import PricingCardSkeleton from './PricingCardSkeleton';
import { useMinimumLoadingTime } from '../../../../../hooks/common/useMinimumLoadingTime';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';

const PricingCardView = ({
  filteredModels,
  loading,
  rowSelection,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  selectedGroup,
  groupRatio,
  copyText,
  setModalImageUrl,
  setIsModalOpenurl,
  currency,
  siteDisplayType = 'USD',
  tokenUnit,
  displayPrice,
  showRatio,
  t,
  selectedRowKeys = [],
  setSelectedRowKeys,
  openModelDetail,
}) => {
  const showSkeleton = useMinimumLoadingTime(loading);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedModels = filteredModels.slice(startIndex, startIndex + pageSize);
  const getModelKey = (model) => model.key ?? model.model_name ?? model.id;
  const isMobile = useIsMobile();

  const handleCheckboxChange = (model, checked) => {
    if (!setSelectedRowKeys) return;
    const modelKey = getModelKey(model);
    const newKeys = checked
      ? Array.from(new Set([...selectedRowKeys, modelKey]))
      : selectedRowKeys.filter((key) => key !== modelKey);
    setSelectedRowKeys(newKeys);
    rowSelection?.onChange?.(newKeys, null);
  };

  const getModelIcon = (model) => {
    if (!model || !model.model_name) {
      return (
        <div className='pricing-card-icon-wrap'>
          <Avatar size='default' style={{ width: 36, height: 36, borderRadius: 12 }}>?</Avatar>
        </div>
      );
    }
    if (model.icon) {
      return (
        <div className='pricing-card-icon-wrap'>
          {getLobeHubIcon(model.icon, 28)}
        </div>
      );
    }
    if (model.vendor_icon) {
      return (
        <div className='pricing-card-icon-wrap'>
          {getLobeHubIcon(model.vendor_icon, 28)}
        </div>
      );
    }
    const avatarText = model.model_name.slice(0, 2).toUpperCase();
    return (
      <div className='pricing-card-icon-wrap'>
        <Avatar
          size='default'
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            backgroundColor: 'rgba(var(--hp-accent-rgb), 0.1)',
            color: 'var(--hp-accent)',
          }}
        >
          {avatarText}
        </Avatar>
      </div>
    );
  };

  const renderTags = (record) => {
    const tags = [];
    if (record.quota_type === 1) {
      tags.push(
        <Tag key='billing' shape='circle' size='small' className='pricing-tag-billing pricing-tag-per-call'>
          {t('按次计费')}
        </Tag>,
      );
    } else if (record.quota_type === 0) {
      const ratio = record.model_ratio != null ? parseFloat(record.model_ratio) : 1;
      tags.push(
        <Tag key='billing' shape='circle' size='small' className='pricing-tag-billing pricing-tag-per-token'>
          {t('倍率')}：{ratio}
        </Tag>,
      );
    }
    if (record.tags) {
      const tagArr = record.tags.split(',').filter(Boolean);
      tagArr.slice(0, 3).forEach((tg, idx) => {
        tags.push(
          <Tag key={`custom-${idx}`} shape='circle' size='small' className='pricing-tag-custom'>
            {tg.trim()}
          </Tag>,
        );
      });
    }
    return tags;
  };

  if (showSkeleton) {
    return <PricingCardSkeleton rowSelection={!!rowSelection} showRatio={showRatio} />;
  }

  if (!filteredModels || filteredModels.length === 0) {
    return (
      <div className='flex justify-center items-center py-20'>
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
          description={t('搜索无结果')}
        />
      </div>
    );
  }

  return (
    <div className='pricing-cards-container'>
      {/* Card Grid */}
      <div className='pricing-card-grid'>
        {paginatedModels.map((model, index) => {
          const modelKey = getModelKey(model);
          const isSelected = selectedRowKeys.includes(modelKey);

          const priceData = calculateModelPrice({
            record: model,
            selectedGroup,
            groupRatio,
            tokenUnit,
            displayPrice,
            currency,
            quotaDisplayType: siteDisplayType,
          }) ?? {};

          return (
            <div
              key={modelKey || index}
              className={`pricing-card-v2 ${isSelected ? 'pricing-card-v2-selected' : ''}`}
              onClick={() => openModelDetail && openModelDetail(model)}
            >
              {/* Card Header: Icon + Name + Copy */}
              <div className='pricing-card-top'>
                <div className='pricing-card-top-left'>
                  {getModelIcon(model)}
                  <div className='pricing-card-name-area'>
                    <div className='pricing-card-model-name' title={model.model_name}>
                      {model.model_name}
                    </div>
                    {model.vendor_name && (
                      <div className='pricing-card-vendor-name'>{model.vendor_name}</div>
                    )}
                  </div>
                </div>
                <div className='pricing-card-top-actions'>
                  <button
                    className='pricing-card-copy-btn'
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(model.model_name);
                    }}
                    title={t('复制模型名称')}
                  >
                    <Copy size={13} />
                  </button>
                  {rowSelection && (
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleCheckboxChange(model, e.target.checked);
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Description */}
              {model.description && (
                <p className='pricing-card-desc'>{model.description}</p>
              )}

              {/* Price */}
              <div className='pricing-card-price'>
                {priceData?.isPerToken && priceData?.inputPrice && priceData?.completionPrice ? (
                  <div className='pricing-card-price-grid'>
                    <div className='pricing-card-price-row'>
                      <span className='pricing-price-arrow pricing-price-in'>↑</span>
                      <span className='pricing-price-value'>{priceData.inputPrice}/1{tokenUnit}</span>
                      <span className='pricing-price-label'>{t('输入')}</span>
                    </div>
                    <div className='pricing-card-price-row'>
                      <span className='pricing-price-arrow pricing-price-out'>↓</span>
                      <span className='pricing-price-value'>{priceData.completionPrice}/1{tokenUnit}</span>
                      <span className='pricing-price-label'>{t('输出')}</span>
                    </div>
                  </div>
                ) : priceData?.price ? (
                  <div className='pricing-card-price-row'>
                    <span className='pricing-price-arrow pricing-price-fixed'>↓</span>
                    <span className='pricing-price-value'>{priceData.price}</span>
                    <span className='pricing-price-label'>{t('单次')}</span>
                  </div>
                ) : (
                  <div className='pricing-price-value'>
                    {formatPriceInfo(priceData, t, siteDisplayType)}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className='pricing-card-tags'>
                {renderTags(model)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {filteredModels.length > 0 && (
        <div className='pricing-pagination-v2'>
          <Pagination
            currentPage={currentPage}
            pageSize={pageSize}
            total={filteredModels.length}
            showSizeChanger
            pageSizeOptions={[12, 24, 48, 96]}
            size={isMobile ? 'small' : 'default'}
            showQuickJumper={!isMobile}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default PricingCardView;
