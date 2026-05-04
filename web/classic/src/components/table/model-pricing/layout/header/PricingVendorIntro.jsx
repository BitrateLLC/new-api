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

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  Card,
  Tag,
  Avatar,
  Input,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { getLobeHubIcon } from '../../../../../helpers';

const CONFIG = {
  CAROUSEL_INTERVAL: 2500,
  ICON_SIZE: 40,
  UNKNOWN_VENDOR: 'unknown',
};

const CONTENT_TEXTS = {
  unknown: {
    displayName: (t) => t('未知供应商'),
    description: (t) =>
      t('包含来自未知或未标明供应商的AI模型，这些模型可能来自小型供应商或开源项目。'),
  },
  all: {
    description: (t) =>
      t('查看所有可用的AI模型供应商，包括众多知名供应商的模型。'),
  },
  fallback: {
    description: (t) => t('该供应商提供多种AI模型，适用于不同的应用场景。'),
  },
};

const PricingVendorIntro = memo(
  ({
    filterVendor,
    models = [],
    allModels = [],
    t,
    selectedRowKeys = [],
    copyText,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isMobile = false,
    searchValue = '',
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
    tokenUnit,
    setTokenUnit,
  }) => {
    const [currentOffset, setCurrentOffset] = useState(0);

    const vendorInfo = useMemo(() => {
      const vendors = new Map();
      let unknownCount = 0;
      const sourceModels =
        Array.isArray(allModels) && allModels.length > 0 ? allModels : models;

      sourceModels.forEach((model) => {
        if (model.vendor_name) {
          const existing = vendors.get(model.vendor_name);
          if (existing) {
            existing.count++;
          } else {
            vendors.set(model.vendor_name, {
              name: model.vendor_name,
              icon: model.vendor_icon,
              description: model.vendor_description,
              count: 1,
            });
          }
        } else {
          unknownCount++;
        }
      });

      const vendorList = Array.from(vendors.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      if (unknownCount > 0) {
        vendorList.push({
          name: CONFIG.UNKNOWN_VENDOR,
          icon: null,
          description: CONTENT_TEXTS.unknown.description(t),
          count: unknownCount,
        });
      }

      return vendorList;
    }, [allModels, models, t]);

    const currentModelCount = models.length;

    useEffect(() => {
      if (filterVendor !== 'all' || vendorInfo.length <= 1) {
        setCurrentOffset(0);
        return;
      }
      const interval = setInterval(() => {
        setCurrentOffset((prev) => (prev + 1) % vendorInfo.length);
      }, CONFIG.CAROUSEL_INTERVAL);
      return () => clearInterval(interval);
    }, [filterVendor, vendorInfo.length]);

    const getVendorDescription = useCallback(
      (vendorKey) => {
        if (vendorKey === 'all') return CONTENT_TEXTS.all.description(t);
        if (vendorKey === CONFIG.UNKNOWN_VENDOR) return CONTENT_TEXTS.unknown.description(t);
        const vendor = vendorInfo.find((v) => v.name === vendorKey);
        return vendor?.description || CONTENT_TEXTS.fallback.description(t);
      },
      [vendorInfo, t],
    );

    const getDisplayName = (vendorKey) => {
      if (vendorKey === 'all') return t('全部供应商');
      if (vendorKey === CONFIG.UNKNOWN_VENDOR) return CONTENT_TEXTS.unknown.displayName(t);
      return vendorKey;
    };

    const getCurrentVendor = () => {
      if (filterVendor === 'all') {
        return vendorInfo.length > 0
          ? vendorInfo[currentOffset % vendorInfo.length]
          : null;
      }
      return vendorInfo.find((v) => v.name === filterVendor) || null;
    };

    const renderAvatar = () => {
      const vendor = getCurrentVendor();
      if (!vendor) {
        return (
          <Avatar size='large' style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            AI
          </Avatar>
        );
      }
      if (vendor.icon) {
        return getLobeHubIcon(vendor.icon, CONFIG.ICON_SIZE);
      }
      return (
        <Avatar
          size='large'
          style={{ backgroundColor: 'rgba(var(--hp-accent-rgb), 0.15)' }}
        >
          {vendor.name === CONFIG.UNKNOWN_VENDOR
            ? '?'
            : vendor.name.charAt(0).toUpperCase()}
        </Avatar>
      );
    };

    const handleTokenUnitToggle = () => {
      setTokenUnit?.(tokenUnit === 'K' ? 'M' : 'K');
    };

    const handleViewModeToggle = () => {
      setViewMode?.(viewMode === 'table' ? 'card' : 'table');
    };

    return (
      <div className='pricing-header-v2'>
        {/* 渐变 Header 卡片 */}
        <Card className='pricing-vendor-intro-card' bodyStyle={{ padding: 0 }}>
          <div className='pricing-vendor-intro-cover'>
            <div className='pricing-vendor-intro-left'>
              <div className='pricing-vendor-intro-title-row'>
                <h2 className='pricing-vendor-intro-title'>
                  {getDisplayName(filterVendor)}
                </h2>
                <span className='pricing-vendor-intro-badge'>
                  {t('共 {{count}} 个模型', { count: currentModelCount })}
                </span>
              </div>
              <p className='pricing-vendor-intro-desc'>
                {getVendorDescription(filterVendor)}
              </p>
            </div>
            <div className='pricing-vendor-intro-right'>
              <div className='pricing-vendor-intro-avatar'>
                {renderAvatar()}
              </div>
            </div>
          </div>
        </Card>

        {/* 搜索栏 */}
        <div className='pricing-search-bar'>
          <Input
            prefix={<IconSearch style={{ color: 'var(--hp-muted)' }} />}
            placeholder={t('搜索模型名称、供应商或标签...')}
            value={searchValue}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onChange={handleChange}
            showClear
            size='large'
            className='pricing-search-input'
          />
        </div>
      </div>
    );
  },
);

PricingVendorIntro.displayName = 'PricingVendorIntro';

export default PricingVendorIntro;
