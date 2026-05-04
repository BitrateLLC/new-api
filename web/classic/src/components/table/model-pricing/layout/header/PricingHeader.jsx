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

import React, { memo } from 'react';
import { Input, Button, Divider } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';

const PricingHeader = memo(
  ({
    searchValue,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    filteredModels,
    currentPage,
    pageSize,
    tokenUnit,
    setTokenUnit,
    t,
  }) => {
    const totalModels = filteredModels?.length || 0;
    const totalPages = Math.ceil(totalModels / pageSize);

    const handleTokenUnitToggle = () => {
      setTokenUnit?.(tokenUnit === 'K' ? 'M' : 'K');
    };

    return (
      <div className='pricing-header-v2'>
        {/* 搜索栏 */}
        <div className='pricing-header-search'>
          <Input
            prefix={<IconSearch className='pricing-header-search-icon' />}
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

        {/* 统计信息 */}
        <div className='pricing-header-meta'>
          <div className='pricing-header-stats'>
            <span className='pricing-header-stat-count'>
              {totalModels} {t('个模型')}
            </span>
            <Divider layout='vertical' margin='8px' />
            <span className='pricing-header-stat-page'>
              {currentPage}/{totalPages || 1}
            </span>
          </div>
        </div>
      </div>
    );
  },
);

PricingHeader.displayName = 'PricingHeader';

export default PricingHeader;
