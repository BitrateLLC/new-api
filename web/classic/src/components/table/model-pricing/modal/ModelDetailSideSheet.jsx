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

import React, { useEffect } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';

import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import ModelHeader from './components/ModelHeader';
import ModelBasicInfo from './components/ModelBasicInfo';
import ModelEndpoints from './components/ModelEndpoints';
import ModelPricingTable from './components/ModelPricingTable';

const { Text } = Typography;

const ModelDetailSideSheet = ({
  visible,
  onClose,
  modelData,
  groupRatio,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  showRatio,
  usableGroup,
  vendorsMap,
  endpointMap,
  autoGroups,
  t,
}) => {
  const isMobile = useIsMobile();

  // Lock body scroll when modal is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  // Close on Escape key
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className='model-detail-modal-overlay' onClick={onClose}>
      <div
        className={`model-detail-modal ${isMobile ? 'model-detail-modal--mobile' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='model-detail-modal-header'>
          <ModelHeader modelData={modelData} vendorsMap={vendorsMap} t={t} />
          <button
            className='model-detail-modal-close'
            onClick={onClose}
            aria-label='Close'
          >
            <IconClose size='large' />
          </button>
        </div>

        {/* Body */}
        <div className='model-detail-modal-body'>
          {!modelData && (
            <div className='model-detail-modal-loading'>
              <Text type='secondary'>{t('加载中...')}</Text>
            </div>
          )}
          {modelData && (
            <div className={`model-detail-modal-columns ${isMobile ? 'model-detail-modal-columns--mobile' : ''}`}>
              {/* Left column: basic info + endpoints */}
              <div className='model-detail-modal-col-left'>
                <ModelBasicInfo
                  modelData={modelData}
                  vendorsMap={vendorsMap}
                  t={t}
                />
                <ModelEndpoints
                  modelData={modelData}
                  endpointMap={endpointMap}
                  t={t}
                />
              </div>
              {/* Right column: pricing */}
              <div className='model-detail-modal-col-right'>
                <ModelPricingTable
                  modelData={modelData}
                  groupRatio={groupRatio}
                  currency={currency}
                  siteDisplayType={siteDisplayType}
                  tokenUnit={tokenUnit}
                  displayPrice={displayPrice}
                  showRatio={showRatio}
                  usableGroup={usableGroup}
                  autoGroups={autoGroups}
                  t={t}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelDetailSideSheet;
