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
import { Avatar, Tooltip } from '@douyinfe/semi-ui';
import { IconGridSquare } from '@douyinfe/semi-icons';
import { getLobeHubIcon } from '../../../../helpers';
import { usePricingFilterCounts } from '../../../../hooks/model-pricing/usePricingFilterCounts';

const PricingVendorNav = ({
  filterVendor,
  setFilterVendor,
  filterGroup,
  filterQuotaType,
  filterEndpointType,
  filterTag,
  models = [],
  loading,
  t,
  searchValue,
}) => {
  const { vendorModels } = usePricingFilterCounts({
    models,
    filterGroup,
    filterQuotaType,
    filterEndpointType,
    filterVendor,
    filterTag,
    searchValue,
  });

  // 获取所有供应商
  const vendorData = React.useMemo(() => {
    const vendors = new Map();
    let hasUnknown = false;

    models.forEach((model) => {
      if (model.vendor_name) {
        if (!vendors.has(model.vendor_name)) {
          vendors.set(model.vendor_name, {
            name: model.vendor_name,
            icon: model.vendor_icon,
            count: 0,
          });
        }
        vendors.get(model.vendor_name).count++;
      } else {
        hasUnknown = true;
      }
    });

    const list = Array.from(vendors.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return { list, hasUnknown };
  }, [models]);

  // 计算当前过滤后的数量
  const getCount = React.useCallback(
    (vendor) => {
      if (vendor === 'all') return vendorModels.length;
      if (vendor === 'unknown')
        return vendorModels.filter((m) => !m.vendor_name).length;
      return vendorModels.filter((m) => m.vendor_name === vendor).length;
    },
    [vendorModels],
  );

  const navItems = React.useMemo(() => {
    const items = [
      {
        value: 'all',
        label: t('全部'),
        icon: null,
        count: getCount('all'),
      },
    ];

    vendorData.list.forEach((v) => {
      items.push({
        value: v.name,
        label: v.name,
        icon: v.icon,
        count: getCount(v.name),
      });
    });

    if (vendorData.hasUnknown) {
      items.push({
        value: 'unknown',
        label: t('未知'),
        icon: null,
        count: getCount('unknown'),
      });
    }

    return items;
  }, [vendorData, getCount, t]);

  return (
    <div className='vendor-nav-container'>
      {/* 导航标题 */}
      <div className='vendor-nav-header'>
        <span className='vendor-nav-title'>{t('模型广场')}</span>
        <span className='vendor-nav-subtitle'>
          {t('AI Models')}
        </span>
      </div>

      {/* 供应商列表 */}
      <nav className='vendor-nav-list'>
        {navItems.map((item) => {
          const isActive = filterVendor === item.value;
          return (
            <button
              key={item.value}
              className={`vendor-nav-item ${isActive ? 'vendor-nav-item-active' : ''}`}
              onClick={() => setFilterVendor(item.value)}
            >
              <span className='vendor-nav-item-icon'>
                {item.value === 'all' ? (
                  <IconGridSquare size='small' />
                ) : item.icon ? (
                  getLobeHubIcon(item.icon, 18)
                ) : (
                  <Avatar
                    size='extra-extra-small'
                    style={{
                      width: 18,
                      height: 18,
                      fontSize: 10,
                      backgroundColor: 'var(--semi-color-fill-1)',
                      color: 'var(--semi-color-text-2)',
                    }}
                  >
                    {item.label.charAt(0).toUpperCase()}
                  </Avatar>
                )}
              </span>
              <span className='vendor-nav-item-label'>{item.label}</span>
              <span className='vendor-nav-item-count'>{item.count}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default PricingVendorNav;
