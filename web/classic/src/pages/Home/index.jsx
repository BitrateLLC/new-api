/*
Copyright (C) 2025 QuantumNous
AGPL-3.0 License — see LICENSE for details
*/

import React, { useContext, useEffect, useState, useRef } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { API, showError, copy, showSuccess } from '../../helpers';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { API_ENDPOINTS } from '../../constants/common.constant';
import { StatusContext } from '../../context/Status';
import { useActualTheme } from '../../context/Theme';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import {
  IconGithubLogo,
  IconFile,
  IconCopy,
  IconKey,
  IconArrowRight,
  IconTickCircle,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import NoticeModal from '../../components/layout/NoticeModal';
import OpenAI from '@lobehub/icons/es/OpenAI';
import Claude from '@lobehub/icons/es/Claude';
import Gemini from '@lobehub/icons/es/Gemini';
import DeepSeek from '@lobehub/icons/es/DeepSeek';
import Qwen from '@lobehub/icons/es/Qwen';
import Meta from '@lobehub/icons/es/Meta';
import Spark from '@lobehub/icons/es/Spark';
import ChatGLM from '@lobehub/icons/es/ChatGLM';
import Grok from '@lobehub/icons/es/Grok';
import Mistral from '@lobehub/icons/es/Mistral';

const API_TABS = [
  { key: 'completions', path: '/v1/chat/completions' },
  { key: 'responses', path: '/v1/responses' },
  { key: 'models', path: '/v1/models' },
];

// 逐字打字动画 helper
function AnimatedText({ text, baseDelay = 0, intervalMs = 40, className = '' }) {
  return (
    <span className={className}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className='home-og-tech-char is-animated'
          style={{ animationDelay: `${baseDelay + i * intervalMs}ms` }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

// 代码编辑器打字动画组件 — 逐字母打字效果
function CodeTypingAnimation() {
  // 每个字符带语法高亮类名
  const codeChars = [
    // Line 1: const ai = new OpenAI({
    { ch: 'c', cls: 'kw' }, { ch: 'o', cls: 'kw' }, { ch: 'n', cls: 'kw' }, { ch: 's', cls: 'kw' }, { ch: 't', cls: 'kw' }, { ch: ' ', cls: '' },
    { ch: 'a', cls: 'var' }, { ch: 'i', cls: 'var' },
    { ch: ' ', cls: '' }, { ch: '=', cls: 'op' }, { ch: ' ', cls: '' },
    { ch: 'n', cls: 'kw' }, { ch: 'e', cls: 'kw' }, { ch: 'w', cls: 'kw' }, { ch: ' ', cls: '' },
    { ch: 'O', cls: 'fn' }, { ch: 'p', cls: 'fn' }, { ch: 'e', cls: 'fn' }, { ch: 'n', cls: 'fn' }, { ch: 'A', cls: 'fn' }, { ch: 'I', cls: 'fn' },
    { ch: '(', cls: 'br' }, { ch: '{', cls: 'br' }, { ch: '\n', cls: '' },
    // Line 2:   baseURL: "https://api.tokenbuy.ai/v1",
    { ch: ' ', cls: '' }, { ch: ' ', cls: '' },
    { ch: 'b', cls: 'prop' }, { ch: 'a', cls: 'prop' }, { ch: 's', cls: 'prop' }, { ch: 'e', cls: 'prop' }, { ch: 'U', cls: 'prop' }, { ch: 'R', cls: 'prop' }, { ch: 'L', cls: 'prop' },
    { ch: ':', cls: 'op' }, { ch: ' ', cls: '' },
    { ch: '"', cls: 'str' }, { ch: 'h', cls: 'str' }, { ch: 't', cls: 'str' }, { ch: 't', cls: 'str' }, { ch: 'p', cls: 'str' }, { ch: 's', cls: 'str' }, { ch: ':', cls: 'str' }, { ch: '/', cls: 'str' }, { ch: '/', cls: 'str' }, { ch: 'a', cls: 'str' }, { ch: 'p', cls: 'str' }, { ch: 'i', cls: 'str' }, { ch: '.', cls: 'str' }, { ch: 't', cls: 'str' }, { ch: 'o', cls: 'str' }, { ch: 'k', cls: 'str' }, { ch: 'e', cls: 'str' }, { ch: 'n', cls: 'str' }, { ch: 'b', cls: 'str' }, { ch: 'u', cls: 'str' }, { ch: 'y', cls: 'str' }, { ch: '.', cls: 'str' }, { ch: 'a', cls: 'str' }, { ch: 'i', cls: 'str' }, { ch: '/', cls: 'str' }, { ch: 'v', cls: 'str' }, { ch: '1', cls: 'str' }, { ch: '"', cls: 'str' },
    { ch: ',', cls: 'op' }, { ch: '\n', cls: '' },
    // Line 3:   apiKey: "sk-***"
    { ch: ' ', cls: '' }, { ch: ' ', cls: '' },
    { ch: 'a', cls: 'prop' }, { ch: 'p', cls: 'prop' }, { ch: 'i', cls: 'prop' }, { ch: 'K', cls: 'prop' }, { ch: 'e', cls: 'prop' }, { ch: 'y', cls: 'prop' },
    { ch: ':', cls: 'op' }, { ch: ' ', cls: '' },
    { ch: '"', cls: 'str' }, { ch: 's', cls: 'str' }, { ch: 'k', cls: 'str' }, { ch: '-', cls: 'str' }, { ch: '*', cls: 'str' }, { ch: '*', cls: 'str' }, { ch: '*', cls: 'str' }, { ch: '"', cls: 'str' }, { ch: '\n', cls: '' },
    // Line 4: });
    { ch: '}', cls: 'br' }, { ch: ')', cls: 'br' }, { ch: ';', cls: 'br' },
  ];

  const [charCount, setCharCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let idx = 0;
    const timer = setInterval(() => {
      idx++;
      if (idx >= codeChars.length) {
        setCharCount(codeChars.length);
        setDone(true);
        clearInterval(timer);
        return;
      }
      setCharCount(idx);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  // 将已显示字符按 \n 分行渲染
  const visibleChars = codeChars.slice(0, charCount);
  const lines = [];
  let currentLine = [];
  visibleChars.forEach((c) => {
    if (c.ch === '\n') {
      lines.push(currentLine);
      currentLine = [];
    } else {
      currentLine.push(c);
    }
  });
  lines.push(currentLine);

  return (
    <div className='og-code-editor'>
      <div className='og-code-dots'>
        <span className='og-dot og-dot-red' />
        <span className='og-dot og-dot-yellow' />
        <span className='og-dot og-dot-green' />
      </div>
      <div className='og-code-body'>
        {lines.map((lineChars, li) => (
          <div key={li} className='og-code-line'>
            {lineChars.map((c, ci) => (
              <span key={ci} className={c.cls ? `og-tok-${c.cls}` : ''}>{c.ch === ' ' ? '\u00A0' : c.ch}</span>
            ))}
            {li === lines.length - 1 && <span className='og-cursor'>|</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 右侧可视化区 — 笔记本 + 环绕图标
function HeroVisual() {
  const models = [
    { Icon: OpenAI,   size: 30, radiusOffset: 8,   angleOffset: -0.06 },
    { Icon: Claude,   size: 28, radiusOffset: -10,  angleOffset: 0.08 },
    { Icon: Gemini,   size: 25, radiusOffset: 12,  angleOffset: -0.04 },
    { Icon: DeepSeek, size: 27, radiusOffset: -6,  angleOffset: 0.05 },
    { Icon: Qwen,     size: 20, radiusOffset: 5,   angleOffset: -0.07 },
    { Icon: Meta,     size: 23, radiusOffset: -12,  angleOffset: 0.03 },
    { Icon: Grok,     size: 18, radiusOffset: 14,  angleOffset: 0.06 },
    { Icon: Mistral,  size: 22, radiusOffset: -8,  angleOffset: -0.05 },
    { Icon: Spark,    size: 19, radiusOffset: 10,  angleOffset: 0.04 },
    { Icon: ChatGLM,  size: 21, radiusOffset: -5,  angleOffset: -0.03 },
  ];

  const logoCx = 250;
  const logoCy = 235;
  const laptopCx = 250;
  const laptopCy = 260;
  const count = models.length;
  const ellipseA = 230;
  const ellipseB = 155;
  const sideCount = Math.floor(count / 2);

  const offsets = [
    { dx: 18, dy: -22 }, { dx: -15, dy: 20 }, { dx: 22, dy: 16 },
    { dx: -20, dy: -18 }, { dx: 16, dy: 24 }, { dx: -24, dy: -15 },
    { dx: 19, dy: -21 }, { dx: -17, dy: 23 }, { dx: 25, dy: -16 },
    { dx: -21, dy: 19 },
  ];

  const iconPositions = models.map((m, i) => {
    const isLeft = i < sideCount;
    const sideIndex = isLeft ? i : i - sideCount;
    const leftStart = 2 * Math.PI / 3;
    const leftEnd = 4 * Math.PI / 3;
    const rightStart = -Math.PI / 3;
    const rightEnd = Math.PI / 3;
    let angle;
    if (isLeft) {
      angle = leftStart + (leftEnd - leftStart) * (sideIndex / (sideCount - 1));
    } else {
      angle = rightStart + (rightEnd - rightStart) * (sideIndex / (sideCount - 1));
    }
    let x = logoCx + ellipseA * Math.cos(angle);
    let y = logoCy + ellipseB * Math.sin(angle);
    const sizeAdjust = (m.size - 26) * 0.3;
    const ddx = x - logoCx;
    const ddy = y - logoCy;
    const distance = Math.sqrt(ddx * ddx + ddy * ddy);
    if (distance > 0) {
      x -= (sizeAdjust * ddx) / distance;
      y -= (sizeAdjust * ddy) / distance;
    }
    x += offsets[i].dx;
    y += offsets[i].dy;
    return { x, y };
  });

  return (
    <div className='home-og-visual'>
      {/* 背景辉光 */}
      <div className='home-og-glow' />
      {/* 星点背景 */}
      <div className='home-og-stars' />

      {/* SVG 连线层 */}
      <svg className='home-og-svg' viewBox='0 0 500 500' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <defs>
          <filter id='og-glow' x='-50%' y='-50%' width='200%' height='200%'>
            <feGaussianBlur in='SourceGraphic' stdDeviation='2' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
          <filter id='og-glow-soft' x='-50%' y='-50%' width='200%' height='200%'>
            <feGaussianBlur in='SourceGraphic' stdDeviation='4' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
          <filter id='og-arrival-glow' x='-200%' y='-200%' width='500%' height='500%'>
            <feGaussianBlur in='SourceGraphic' stdDeviation='6' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
          {models.map((m, i) => {
            const pos = iconPositions[i];
            const hueShift = (i % 3 === 0) ? '#60a5fa' : (i % 3 === 1) ? '#a78bfa' : '#34d399';
            return (
              <React.Fragment key={`og-defs-${i}`}>
                <linearGradient id={`og-grad-${i}`} x1={pos.x} y1={pos.y} x2={laptopCx} y2={laptopCy} gradientUnits='userSpaceOnUse'>
                  <stop offset='0%' stopColor={hueShift} stopOpacity='0.05' />
                  <stop offset='50%' stopColor='var(--hp-accent)' stopOpacity='0.25' />
                  <stop offset='100%' stopColor='var(--hp-accent)' stopOpacity='0.5' />
                </linearGradient>
              </React.Fragment>
            );
          })}
        </defs>
        {models.map((m, i) => {
          const pos = iconPositions[i];
          const d = `M${pos.x},${pos.y} C${pos.x + (laptopCx - pos.x) * 0.4},${pos.y + (laptopCy - pos.y) * 0.1} ${laptopCx + (pos.x - laptopCx) * 0.1},${laptopCy + (pos.y - laptopCy) * 0.4} ${laptopCx},${laptopCy}`;
          const pathId = `og-path-${i}`;
          const enterDelay = 0.3 + i * 0.1;
          // 多粒子配置：主粒子 + 2个辅助粒子，大小/速度/颜色各异
          const particles = [
            { r: 1.2, dur: 3.5 + i * 0.25, delay: enterDelay, color: 'var(--hp-accent)', opacity: '0;0.8;0.9;0', rAnim: '1;1.2;2;0.8', cls: 'og-particle-main' },
            { r: 0.8, dur: 4.2 + i * 0.3, delay: enterDelay + 1.2, color: '#60a5fa', opacity: '0;0.6;0.7;0', rAnim: '0.6;0.8;1.2;0.5', cls: 'og-particle-aux1' },
            { r: 1.0, dur: 5.0 + i * 0.2, delay: enterDelay + 2.5, color: '#a78bfa', opacity: '0;0.5;0.65;0', rAnim: '0.7;1;1.5;0.6', cls: 'og-particle-aux2' },
          ];
          // 每5-6秒出现的大亮粒子
          const burstDur = 5.5 + (i % 3) * 0.5;
          const burstDelay = enterDelay + 3 + (i % 4) * 1.2;
          return (
            <g key={pathId} className='home-og-line-group' style={{ animationDelay: `${enterDelay}s` }}>
              {/* 底层柔和发光 */}
              <path
                d={d}
                stroke={`url(#og-grad-${i})`}
                strokeWidth='5'
                fill='none'
                opacity='0.15'
                filter='url(#og-glow-soft)'
              />
              {/* 主线条 */}
              <path
                id={pathId}
                d={d}
                stroke={`url(#og-grad-${i})`}
                strokeWidth='3'
                fill='none'
                opacity='0.45'
                className='home-og-line'
              />
              {/* 脉冲 */}
              <path
                d={d}
                stroke='var(--hp-accent)'
                strokeWidth='2.5'
                fill='none'
                opacity='0.6'
                strokeDasharray='3 16 5 16'
                filter='url(#og-glow)'
                className='home-og-pulse'
                style={{
                  animationDuration: `${3.2 + i * 0.25}s`,
                  animationDelay: `${enterDelay}s`,
                }}
              />
              {/* 多粒子系统 — 不同大小/速度/颜色/拖尾 */}
              {particles.map((p, pi) => (
                <circle key={`p-${i}-${pi}`} r={p.r} fill={p.color} opacity='0' filter='url(#og-glow)' className={p.cls}>
                  <animateMotion dur={`${p.dur}s`} repeatCount='indefinite' begin={`${p.delay}s`}>
                    <mpath xlinkHref={`#${pathId}`} />
                  </animateMotion>
                  <animate attributeName='opacity' values={p.opacity} keyTimes='0;0.1;0.85;1' dur={`${p.dur}s`} repeatCount='indefinite' begin={`${p.delay}s`} />
                  <animate attributeName='r' values={p.rAnim} keyTimes='0;0.5;0.92;1' dur={`${p.dur}s`} repeatCount='indefinite' begin={`${p.delay}s`} />
                </circle>
              ))}
              {/* 偶尔出现的大亮粒子 — 更大更亮，低频出现 */}
              <circle r='1.5' fill='var(--hp-accent)' opacity='0' filter='url(#og-arrival-glow)' className='og-particle-burst'>
                <animateMotion dur={`${burstDur}s`} repeatCount='indefinite' begin={`${burstDelay}s`}>
                  <mpath xlinkHref={`#${pathId}`} />
                </animateMotion>
                <animate attributeName='opacity' values='0;0;0.95;1;0.9;0' keyTimes='0;0.05;0.12;0.5;0.88;1' dur={`${burstDur}s`} repeatCount='indefinite' begin={`${burstDelay}s`} />
                <animate attributeName='r' values='1;2;2.5;2;1' keyTimes='0;0.15;0.5;0.85;1' dur={`${burstDur}s`} repeatCount='indefinite' begin={`${burstDelay}s`} />
              </circle>
              {/* 到达笔记本端闪光扩散 — 主粒子到达 */}
              <circle cx={laptopCx} cy={laptopCy} r='0' fill='var(--hp-accent)' opacity='0' filter='url(#og-arrival-glow)'>
                <animate attributeName='r' values='0;0;8;0' keyTimes='0;0.88;0.95;1' dur={`${particles[0].dur}s`} repeatCount='indefinite' begin={`${enterDelay}s`} />
                <animate attributeName='opacity' values='0;0;0.4;0' keyTimes='0;0.88;0.93;1' dur={`${particles[0].dur}s`} repeatCount='indefinite' begin={`${enterDelay}s`} />
              </circle>
              {/* 大粒子到达时更强烈的闪光 */}
              <circle cx={laptopCx} cy={laptopCy} r='0' fill='var(--hp-accent)' opacity='0' filter='url(#og-arrival-glow)'>
                <animate attributeName='r' values='0;0;12;0' keyTimes='0;0.86;0.94;1' dur={`${burstDur}s`} repeatCount='indefinite' begin={`${burstDelay}s`} />
                <animate attributeName='opacity' values='0;0;0.6;0' keyTimes='0;0.86;0.93;1' dur={`${burstDur}s`} repeatCount='indefinite' begin={`${burstDelay}s`} />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* 环绕的模型图标 — 毛玻璃容器 */}
      <div className='home-og-orbit-icons'>
        {models.map((m, i) => {
          const pos = iconPositions[i];
          const IconAvatar = m.Icon.Avatar;
          const containerSize = Math.round((m.size / 26) * 36);
          const iconDisplaySize = Math.round((containerSize + 14) * 0.82);
          return (
            <div
              key={i}
              className='home-og-orbit-icon'
              style={{
                left: `${(pos.x / 500) * 100}%`,
                top: `${(pos.y / 500) * 100}%`,
                width: `${containerSize + 14}px`,
                height: `${containerSize + 14}px`,
                animationDelay: `${0.3 + i * 0.1}s`,
              }}
            >
              <IconAvatar size={iconDisplaySize} />
            </div>
          );
        })}
      </div>

      {/* 中心笔记本 */}
      <div className='home-og-laptop'>
        <div className='home-og-laptop-screen'>
          <div className='home-og-screen-glare' />
          <div className='home-og-laptop-display'>
            <CodeTypingAnimation />
            <span className='home-og-model-count'>100+ Models</span>
          </div>
        </div>
        <div className='home-og-laptop-base'>
          <div className='home-og-laptop-trackpad' />
        </div>
        <div className='home-og-laptop-bottom' />
      </div>
    </div>
  );
}

const Home = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const actualTheme = useActualTheme();
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(0);

  const isDemoSiteMode = statusState?.status?.demo_site_enabled || false;
  const docsLink = statusState?.status?.docs_link || '';
  const serverAddress =
    statusState?.status?.server_address || `${window.location.origin}`;

  const endpointItems = API_ENDPOINTS.map((e) => ({ value: e }));
  const [endpointIndex, setEndpointIndex] = useState(0);

  // 端点轮播
  useEffect(() => {
    const timer = setInterval(() => {
      setEndpointIndex((prev) => (prev + 1) % endpointItems.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [endpointItems.length]);

  // 加载自定义首页内容
  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    try {
      const res = await API.get('/api/home_page_content');
      const { success, message, data } = res.data;
      if (success) {
        let content = data;
        if (!data.startsWith('https://')) {
          content = marked.parse(data);
        }
        setHomePageContent(content);
        localStorage.setItem('home_page_content', content);
        if (data.startsWith('https://')) {
          const iframe = document.querySelector('iframe');
          if (iframe) {
            iframe.onload = () => {
              iframe.contentWindow.postMessage({ themeMode: actualTheme }, '*');
              iframe.contentWindow.postMessage({ lang: i18n.language }, '*');
            };
          }
        }
      } else {
        showError(message);
        setHomePageContent('');
      }
    } catch (e) {
      console.error('加载首页内容失败:', e);
      setHomePageContent('');
    }
    setHomePageContentLoaded(true);
  };

  // 公告检查
  useEffect(() => {
    const checkNotice = async () => {
      const lastClose = localStorage.getItem('notice_close_date');
      const today = new Date().toDateString();
      if (lastClose !== today) {
        try {
          const res = await API.get('/api/notice');
          const { success, data } = res.data;
          if (success && data && data.trim() !== '') {
            setNoticeVisible(true);
          }
        } catch (e) {
          console.error('获取公告失败:', e);
        }
      }
    };
    checkNotice();
  }, []);

  useEffect(() => {
    displayHomePageContent();
  }, []);

  const handleCopy = async (text) => {
    const ok = await copy(text || serverAddress);
    if (ok) showSuccess(t('已复制到剪切板'));
  };

  // 如果有自定义首页内容，直接渲染
  if (homePageContentLoaded && homePageContent !== '') {
    return (
      <div className='overflow-x-hidden w-full'>
        <NoticeModal
          visible={noticeVisible}
          onClose={() => setNoticeVisible(false)}
          isMobile={isMobile}
        />
        {homePageContent.startsWith('https://') ? (
          <iframe src={homePageContent} className='w-full h-screen border-none' />
        ) : (
          <div
            className='mt-[60px]'
            dangerouslySetInnerHTML={{ __html: homePageContent }}
          />
        )}
      </div>
    );
  }

  // 标题文字
  const titleLine1 = t('统一 AI 接入');
  const titleLine2 = t('与治理平台');
  const descText = t('面向团队与业务系统的统一 AI 接入层。提供配额治理、调用审计、策略控制与实时监控。');
  const line1Len = titleLine1.length;

  // 默认落地页
  return (
    <div className='hp-root'>
      <NoticeModal
        visible={noticeVisible}
        onClose={() => setNoticeVisible(false)}
        isMobile={isMobile}
      />

      {/* ── 1. Hero (左文案 + 右可视化) ── */}
      <section className='hp-hero home-og-hero'>
        {/* 左侧：文案区 */}
        <div className='hp-hero-right home-og-copy'>
          {/* Badge */}
          <div className='hp-hero-badge'>
            <span className='hp-pulse-dot' style={{ background: '#22c55e' }} />
            {t('Online — API Gateway')}
          </div>

          {/* 标题：逐字动画 */}
          <h1 className='hp-hero-title home-og-title'>
            <AnimatedText
              text={titleLine1}
              baseDelay={100}
              intervalMs={60}
            />
            <br />
            <AnimatedText
              text={titleLine2}
              baseDelay={100 + line1Len * 60 + 80}
              intervalMs={60}
              className='hp-hero-title-accent'
            />
          </h1>

          {/* 描述：逐字动画 */}
          <p className='hp-hero-sub home-og-desc'>
            <AnimatedText
              text={descText}
              baseDelay={100 + (line1Len + titleLine2.length) * 60 + 200}
              intervalMs={18}
            />
          </p>

          {/* Endpoint 展示区 */}
          <div className='ep5' id='heroEp'>
            <div className='ep5-tabs'>
              {API_TABS.map((tab, idx) => (
                <button
                  key={tab.key}
                  className={`ep5-tab${activeTab === idx ? ' on' : ''}`}
                  onClick={() => setActiveTab(idx)}
                >
                  {tab.key}
                </button>
              ))}
            </div>
            <div className='ep5-row'>
              <code>{serverAddress}{API_TABS[activeTab].path}</code>
              <button
                className='ep5-copy'
                onClick={() => handleCopy(`${serverAddress}${API_TABS[activeTab].path}`)}
                title={t('复制')}
              >
                <IconCopy size='small' />
              </button>
            </div>
          </div>

          {/* 按钮组 */}
          <div className='hp-cta-group home-og-btns'>
            <Link to='/console' className='hp-btn-primary'>
              <IconKey size='small' />
              {t('开始构建')}
              <IconArrowRight size='small' />
            </Link>
            {docsLink ? (
              <a href={docsLink} target='_blank' rel='noreferrer' className='hp-btn-secondary'>
                <IconFile size='small' />
                {t('查看文档')}
              </a>
            ) : isDemoSiteMode && statusState?.status?.version ? (
              <button
                className='hp-btn-secondary'
                onClick={() => window.open('https://github.com/QuantumNous/new-api', '_blank')}
              >
                <IconGithubLogo size='small' />
                {statusState.status.version}
              </button>
            ) : null}
          </div>

          {/* 特性标签 */}
          <div className='home-og-feature-tags'>
            <span className='home-og-feature-tag'>
              <IconTickCircle size='small' style={{ color: '#22c55e' }} />
              {t('开发者优先')}
            </span>
            <span className='home-og-feature-tag'>
              <IconTickCircle size='small' style={{ color: '#22c55e' }} />
              {t('零数据保留')}
            </span>
          </div>
        </div>

        {/* 右侧：可视化区 */}
        <div className='hp-hero-left home-og-visual-wrap'>
          <HeroVisual />
        </div>
      </section>

      {/* ── 2. 数据统计条 ── */}
      <section className='hp-stats'>
        <div className='hp-stat'>
          <strong>24×7</strong>
          <span>{t('持续服务')}</span>
        </div>
        <div className='hp-stat'>
          <strong>30+</strong>
          <span>{t('可用模型')}</span>
        </div>
        <div className='hp-stat'>
          <strong>99.9%</strong>
          <span>{t('平台可用性')}</span>
        </div>
        <div className='hp-stat'>
          <strong>OpenAI</strong>
          <span>{t('标准 API 协议兼容')}</span>
        </div>
      </section>

      {/* ── CTA 底部号召 ── */}
      <section className='hp-cta-bottom'>
        <h2>{t('开始构建稳定的 AI 接入平台')}</h2>
        <p>{t('几分钟内完成部署，立即为团队提供统一、安全、可观测的 AI 接入服务。')}</p>
        <div className='hp-cta-group'>
          <Link to='/console' className='hp-btn-primary'>
            {t('进入控制台')}
          </Link>
          {docsLink && (
            <a href={docsLink} target='_blank' rel='noreferrer' className='hp-btn-secondary'>
              {t('API 文档')}
            </a>
          )}
        </div>
      </section>

      {/* ── 8. Footer ── */}
      <footer className='hp-footer'>
        <div className='hp-footer-links'>
          <Link to='/console' className='hp-footer-link'>{t('控制台')}</Link>
          {docsLink && (
            <a href={docsLink} target='_blank' rel='noreferrer' className='hp-footer-link'>
              {t('文档')}
            </a>
          )}
          <a
            href='https://github.com/QuantumNous/new-api'
            target='_blank'
            rel='noreferrer'
            className='hp-footer-link'
          >
            GitHub
          </a>
        </div>
        <span className='hp-footer-copy'>
          © {new Date().getFullYear()} New API · Powered by QuantumNous
        </span>
      </footer>
    </div>
  );
};

export default Home;
