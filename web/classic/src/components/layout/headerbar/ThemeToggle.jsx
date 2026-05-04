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

import React, { useMemo, useCallback, useRef } from 'react';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useActualTheme } from '../../../context/Theme';

const ThemeToggle = ({ theme, onThemeToggle, t }) => {
  const actualTheme = useActualTheme();
  const btnRef = useRef(null);

  const themeOptions = useMemo(
    () => [
      {
        key: 'light',
        icon: <Sun size={18} />,
        buttonIcon: <Sun size={18} />,
        label: t('浅色模式'),
        description: t('始终使用浅色主题'),
      },
      {
        key: 'dark',
        icon: <Moon size={18} />,
        buttonIcon: <Moon size={18} />,
        label: t('深色模式'),
        description: t('始终使用深色主题'),
      },
      {
        key: 'auto',
        icon: <Monitor size={18} />,
        buttonIcon: <Monitor size={18} />,
        label: t('自动模式'),
        description: t('跟随系统主题设置'),
      },
    ],
    [t],
  );

  const getItemClassName = (isSelected) =>
    isSelected
      ? '!bg-semi-color-primary-light-default !font-semibold'
      : 'hover:!bg-semi-color-fill-1';

  const currentButtonIcon = useMemo(() => {
    const currentOption = themeOptions.find((option) => option.key === theme);
    return currentOption?.buttonIcon || themeOptions[2].buttonIcon;
  }, [theme, themeOptions]);

  const handleThemeWithTransition = useCallback(
    (newTheme) => {
      if (newTheme === theme) return;

      try {
        // 按钮图标旋转 + 缩放弹跳动画
        const btn = btnRef.current;
        if (btn) {
          btn.classList.add('theme-toggle-morph');
          setTimeout(() => btn.classList.remove('theme-toggle-morph'), 500);
        }

        const isDarkTarget = newTheme === 'dark' ||
          (newTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        const bg = isDarkTarget ? '#1c1c1e' : '#ffffff';
        const fromTopRight = isDarkTarget;
        const animIn = fromTopRight ? 'curtain-in-from-topright' : 'curtain-in-from-bottomleft';
        const animOut = fromTopRight ? 'curtain-out-to-bottomleft' : 'curtain-out-to-topright';

        const curtain = document.createElement('div');
        curtain.style.cssText = `
          position: fixed;
          top: 0; left: 0;
          width: 100vw; height: 100vh;
          z-index: 999;
          pointer-events: none;
          background: ${bg};
          animation: ${animIn} 0.75s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        `;
        document.body.appendChild(curtain);

        // 帘幕覆盖到一半时切换主题
        setTimeout(() => {
          onThemeToggle(newTheme);
        }, 375);

        // 帘幕完全覆盖后，切换为滑出动画
        setTimeout(() => {
          curtain.style.animation = `${animOut} 0.75s cubic-bezier(0.4, 0, 0.2, 1) forwards`;
        }, 750);

        // 滑出完成后移除
        setTimeout(() => {
          curtain.remove();
        }, 1550);

      } catch (e) {
        console.warn('Theme curtain animation failed:', e);
        onThemeToggle(newTheme);
      }
    },
    [theme, onThemeToggle],
  );

  return (
    <Dropdown
      position='bottomRight'
      render={
        <Dropdown.Menu>
          {themeOptions.map((option) => (
            <Dropdown.Item
              key={option.key}
              icon={option.icon}
              onClick={() => handleThemeWithTransition(option.key)}
              className={getItemClassName(theme === option.key)}
            >
              <div className='flex flex-col'>
                <span>{option.label}</span>
                <span className='text-xs text-semi-color-text-2'>
                  {option.description}
                </span>
              </div>
            </Dropdown.Item>
          ))}

          {theme === 'auto' && (
            <>
              <Dropdown.Divider />
              <div className='px-3 py-2 text-xs text-semi-color-text-2'>
                {t('当前跟随系统')}：
                {actualTheme === 'dark' ? t('深色') : t('浅色')}
              </div>
            </>
          )}
        </Dropdown.Menu>
      }
    >
      <Button
        ref={btnRef}
        icon={currentButtonIcon}
        aria-label={t('切换主题')}
        theme='borderless'
        type='tertiary'
        className='!p-1.5 !text-current focus:!bg-semi-color-fill-1 !rounded-full !bg-semi-color-fill-0 hover:!bg-semi-color-fill-1'
      />
    </Dropdown>
  );
};

export default ThemeToggle;
