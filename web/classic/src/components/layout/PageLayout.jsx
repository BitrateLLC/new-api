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

import HeaderBar from './headerbar';
import { Layout } from '@douyinfe/semi-ui';
import SiderBar from './SiderBar';
import App from '../../App';
// Footer removed
import { ToastContainer } from 'react-toastify';
import React, { useContext, useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useSidebarCollapsed } from '../../hooks/common/useSidebarCollapsed';
import { useTranslation } from 'react-i18next';
import {
  API,
  getLogo,
  getSystemName,
  showError,
  setStatusData,
} from '../../helpers';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { useLocation } from 'react-router-dom';
import { normalizeLanguage } from '../../i18n/language';
const { Sider, Content, Header } = Layout;

const PageLayout = () => {
  const actualTheme = useActualTheme();
  const [userState, userDispatch] = useContext(UserContext);
  const [, statusDispatch] = useContext(StatusContext);
  const isMobile = useIsMobile();
  const [collapsed, , setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { i18n } = useTranslation();
  const location = useLocation();

  const shouldInnerPadding =
    location.pathname.includes('/console') &&
    !location.pathname.startsWith('/console/chat') &&
    location.pathname !== '/console/playground' &&
    location.pathname !== '/console/image-playground';

  const isConsoleRoute = location.pathname.startsWith('/console');
  const showSider = isConsoleRoute && (!isMobile || drawerOpen);

  useEffect(() => {
    if (isMobile && drawerOpen && collapsed) {
      setCollapsed(false);
    }
  }, [isMobile, drawerOpen, collapsed, setCollapsed]);

  const loadUser = () => {
    let user = localStorage.getItem('user');
    if (user) {
      let data = JSON.parse(user);
      userDispatch({ type: 'login', payload: data });
    }
  };

  const loadStatus = async () => {
    try {
      const res = await API.get('/api/status');
      const { success, data } = res.data;
      if (success) {
        statusDispatch({ type: 'set', payload: data });
        setStatusData(data);
      } else {
        showError('Unable to connect to server');
        statusDispatch({ type: 'set', payload: {} });
      }
    } catch (error) {
      showError('Failed to load status');
      statusDispatch({ type: 'set', payload: {} });
    }
  };

  useEffect(() => {
    loadUser();
    loadStatus().catch(console.error);
    let systemName = getSystemName();
    if (systemName) {
      document.title = systemName;
    }
    let logo = getLogo();
    if (logo) {
      let linkElement = document.querySelector("link[rel~='icon']");
      if (linkElement) {
        linkElement.href = logo;
      }
    }
  }, []);

  useEffect(() => {
    let logo = getLogo();
    if (logo) {
      let linkElement = document.querySelector("link[rel~='icon']");
      if (linkElement) {
        linkElement.href = logo;
      }
    }
  }, [actualTheme]);

  useEffect(() => {
    let preferredLang;

    if (userState?.user?.setting) {
      try {
        const settings = JSON.parse(userState.user.setting);
        preferredLang = normalizeLanguage(settings.language);
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (!preferredLang) {
      const savedLang = localStorage.getItem('i18nextLng');
      if (savedLang) {
        preferredLang = normalizeLanguage(savedLang);
      }
    }

    if (preferredLang) {
      localStorage.setItem('i18nextLng', preferredLang);
      if (preferredLang !== i18n.language) {
        i18n.changeLanguage(preferredLang);
      }
    }
  }, [i18n, userState?.user?.setting]);

  return (
    <Layout
      className='app-layout'
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        color: 'var(--hp-text)',
      }}
    >
      {/* 导航栏：全宽置顶锁定 + 毛玻璃 */}
      <Header
        style={{
          padding: 0,
          height: 'auto',
          lineHeight: 'normal',
          position: 'fixed',
          width: '100%',
          top: 0,
          zIndex: 100,
          background: 'rgba(var(--hp-bg-rgb), 0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--hp-border)',
        }}
      >
        <HeaderBar
          onMobileMenuToggle={() => setDrawerOpen((prev) => !prev)}
          drawerOpen={drawerOpen}
        />
      </Header>

      {/* 导航栏下方区域：侧边栏 + 内容（不加 paddingTop，让内容可以滚到 Header 下方触发毛玻璃） */}
      <Layout
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {showSider && (
          <Sider
            className='app-sider'
            style={{
              flexShrink: 0,
              width: 'var(--sidebar-current-width)',
              border: 'none',
              paddingRight: '0',
              paddingTop: '64px',
              overflow: 'hidden',
              zIndex: 100,
              background: 'transparent',
            }}
          >
            <SiderBar
              onNavigate={() => {
                if (isMobile) setDrawerOpen(false);
              }}
            />
          </Sider>
        )}
        <Layout
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Content
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingTop: `calc(64px + ${shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0px'})`,
              paddingLeft: shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0',
              paddingRight: shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0',
              paddingBottom: shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0',
              backgroundColor: 'var(--hp-bg)',
            }}
          >
            <App />
          </Content>
          {/* Footer 已移除 - 不再渲染底部版权栏 */}
        </Layout>
      </Layout>
      <ToastContainer />
    </Layout>
  );
};

export default PageLayout;
