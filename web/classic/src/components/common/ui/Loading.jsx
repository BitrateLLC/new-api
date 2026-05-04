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
import { Spin } from '@douyinfe/semi-ui';

const Loading = ({ size = 'small' }) => {
  return (
    <div
      className='fixed inset-0 w-screen h-screen flex flex-col items-center justify-center'
      style={{
        background: 'var(--hp-bg)',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 56,
          height: 56,
          borderRadius: '16px',
          background: 'var(--hp-card)',
          boxShadow: 'var(--hp-shadow-md)',
          animation: 'loading-breathe 1.8s ease-in-out infinite',
        }}
      >
        <Spin size={size} spinning={true} />
      </div>
      <style>{`
        @keyframes loading-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.96); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

export default Loading;
