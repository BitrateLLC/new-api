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
import { Button } from '@douyinfe/semi-ui';
import { RefreshCw, Search } from 'lucide-react';

const DashboardHeader = ({
  getGreeting,
  greetingVisible,
  showSearchModal,
  refresh,
  loading,
  t,
}) => {
  return (
    <div className='db-header'>
      <div className='db-header-left'>
        <h2
          className='db-header-greeting'
          style={{ opacity: greetingVisible ? 1 : 0 }}
        >
          {getGreeting}
        </h2>
      </div>
      <div className='db-header-actions'>
        <Button
          type='tertiary'
          icon={<Search size={15} />}
          onClick={showSearchModal}
          className='db-header-btn'
          style={{
            background: 'var(--hp-accent)',
            color: '#fff',
            width: 36,
            height: 36,
            borderRadius: '50%',
            boxShadow: '0 2px 10px rgba(var(--hp-accent-rgb), 0.25)',
          }}
        />
        <Button
          type='tertiary'
          icon={<RefreshCw size={15} />}
          onClick={refresh}
          loading={loading}
          className='db-header-btn'
          style={{
            background: 'var(--hp-bg-soft)',
            color: 'var(--hp-sub)',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--hp-border)',
          }}
        />
      </div>
    </div>
  );
};

export default DashboardHeader;
