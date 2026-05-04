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
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { IconMenu } from '@douyinfe/semi-icons';
import { useHeaderBar } from '../../../hooks/common/useHeaderBar';
import { useNotifications } from '../../../hooks/common/useNotifications';
import { useNavigation } from '../../../hooks/common/useNavigation';
import NoticeModal from '../NoticeModal';
import MobileMenuButton from './MobileMenuButton';
import HeaderLogo from './HeaderLogo';
import Navigation from './Navigation';
import ActionButtons from './ActionButtons';

const HeaderBar = ({ onMobileMenuToggle, drawerOpen }) => {
  const {
    userState,
    statusState,
    isMobile,
    collapsed,
    logoLoaded,
    currentLang,
    isLoading,
    systemName,
    logo,
    isNewYear,
    isSelfUseMode,
    docsLink,
    isDemoSiteMode,
    isConsoleRoute,
    theme,
    headerNavModules,
    pricingRequireAuth,
    logout,
    handleLanguageChange,
    handleThemeToggle,
    handleMobileMenuToggle,
    navigate,
    t,
  } = useHeaderBar({ onMobileMenuToggle, drawerOpen });

  const {
    noticeVisible,
    unreadCount,
    handleNoticeOpen,
    handleNoticeClose,
    getUnreadKeys,
  } = useNotifications(statusState);

  const { mainNavLinks } = useNavigation(t, docsLink, headerNavModules);

  const handleMobileNavClick = (link) => {
    if (link.isExternal) {
      window.open(link.externalLink, '_blank', 'noopener,noreferrer');
      return;
    }

    let targetPath = link.to;
    if (link.itemKey === 'console' && !userState.user) {
      targetPath = '/login';
    }
    if (link.itemKey === 'pricing' && pricingRequireAuth && !userState.user) {
      targetPath = '/login';
    }
    navigate(targetPath);
  };

  return (
    <header className='text-semi-color-text-0 transition-colors duration-300'>
      <NoticeModal
        visible={noticeVisible}
        onClose={handleNoticeClose}
        isMobile={isMobile}
        defaultTab={unreadCount > 0 ? 'system' : 'inApp'}
        unreadKeys={getUnreadKeys()}
      />

      <div className='w-full px-2'>
        <div className='relative flex items-center justify-between h-16'>
          <div className='flex items-center min-w-0 z-10'>
            <MobileMenuButton
              isConsoleRoute={isConsoleRoute}
              isMobile={isMobile}
              drawerOpen={drawerOpen}
              collapsed={collapsed}
              onToggle={handleMobileMenuToggle}
              t={t}
            />

            {isMobile && !isConsoleRoute && (
              <Dropdown
                position='bottomLeft'
                render={
                  <Dropdown.Menu
                    className='!bg-semi-color-bg-overlay !border-semi-color-border !shadow-lg !rounded-2xl'
                    style={{
                      boxShadow: 'var(--hp-shadow-md)',
                      border: '1px solid var(--hp-border)',
                    }}
                  >
                    {mainNavLinks.map((link) => (
                      <Dropdown.Item
                        key={link.itemKey}
                        onClick={() => handleMobileNavClick(link)}
                        className='!px-3 !py-2 !text-sm !text-semi-color-text-0 hover:!bg-semi-color-fill-1 !rounded-xl !transition-all !duration-200'
                      >
                        {link.text}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                }
              >
                <Button
                  icon={<IconMenu className='text-lg' />}
                  aria-label={t('导航菜单')}
                  theme='borderless'
                  type='tertiary'
                  className='!p-2 !text-current focus:!bg-semi-color-fill-1 !rounded-xl !transition-all !duration-200'
                />
              </Dropdown>
            )}

            <HeaderLogo
              isMobile={isMobile}
              isConsoleRoute={isConsoleRoute}
              logo={logo}
              logoLoaded={logoLoaded}
              isLoading={isLoading}
              systemName={systemName}
              isSelfUseMode={isSelfUseMode}
              isDemoSiteMode={isDemoSiteMode}
              t={t}
            />
          </div>

          {!isMobile && (
            <div className='absolute inset-0 flex items-center justify-center pointer-events-none'>
              <div className='pointer-events-auto'>
                <Navigation
                  mainNavLinks={mainNavLinks}
                  isMobile={isMobile}
                  isLoading={isLoading}
                  userState={userState}
                  pricingRequireAuth={pricingRequireAuth}
                />
              </div>
            </div>
          )}

          <ActionButtons
            isNewYear={isNewYear}
            unreadCount={unreadCount}
            onNoticeOpen={handleNoticeOpen}
            theme={theme}
            onThemeToggle={handleThemeToggle}
            currentLang={currentLang}
            onLanguageChange={handleLanguageChange}
            userState={userState}
            isLoading={isLoading}
            isMobile={isMobile}
            isSelfUseMode={isSelfUseMode}
            logout={logout}
            navigate={navigate}
            t={t}
          />
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
