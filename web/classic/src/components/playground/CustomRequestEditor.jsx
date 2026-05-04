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

import React, { useState, useEffect } from 'react';
import {
  TextArea,
  Typography,
  Button,
  Switch,
  Banner,
} from '@douyinfe/semi-ui';
import { Code, Edit, Check, X, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CustomRequestEditor = ({
  customRequestMode,
  customRequestBody,
  onCustomRequestModeChange,
  onCustomRequestBodyChange,
  defaultPayload,
}) => {
  const { t } = useTranslation();
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [localValue, setLocalValue] = useState(customRequestBody || '');

  useEffect(() => {
    if (
      customRequestMode &&
      (!customRequestBody || customRequestBody.trim() === '')
    ) {
      const defaultJson = defaultPayload
        ? JSON.stringify(defaultPayload, null, 2)
        : '';
      setLocalValue(defaultJson);
      onCustomRequestBodyChange(defaultJson);
    }
  }, [
    customRequestMode,
    defaultPayload,
    customRequestBody,
    onCustomRequestBodyChange,
  ]);

  useEffect(() => {
    if (customRequestBody !== localValue) {
      setLocalValue(customRequestBody || '');
      validateJson(customRequestBody || '');
    }
  }, [customRequestBody]);

  const validateJson = (value) => {
    if (!value.trim()) {
      setIsValid(true);
      setErrorMessage('');
      return true;
    }

    try {
      JSON.parse(value);
      setIsValid(true);
      setErrorMessage('');
      return true;
    } catch (error) {
      setIsValid(false);
      setErrorMessage(`${t('JSON格式错误')}: ${error.message}`);
      return false;
    }
  };

  const handleValueChange = (value) => {
    setLocalValue(value);
    validateJson(value);
    onCustomRequestBodyChange(value);
  };

  const handleModeToggle = (enabled) => {
    onCustomRequestModeChange(enabled);
    if (enabled && defaultPayload) {
      const defaultJson = JSON.stringify(defaultPayload, null, 2);
      setLocalValue(defaultJson);
      onCustomRequestBodyChange(defaultJson);
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(localValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setLocalValue(formatted);
      onCustomRequestBodyChange(formatted);
      setIsValid(true);
      setErrorMessage('');
    } catch (error) {
      // 如果格式化失败，保持原样
    }
  };

  return (
    <div className='space-y-4'>
      {/* 自定义模式开关 */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Code size={16} style={{ color: 'var(--hp-sub)' }} />
          <Typography.Text strong style={{ fontSize: '14px', color: 'var(--hp-text)' }}>
            {t('自定义请求体模式')}
          </Typography.Text>
        </div>
        <Switch
          checked={customRequestMode}
          onChange={handleModeToggle}
          checkedText={t('开')}
          uncheckedText={t('关')}
          size='small'
        />
      </div>

      {customRequestMode && (
        <>
          {/* 提示信息 */}
          <Banner
            type='warning'
            description={t(
              '启用此模式后，将使用您自定义的请求体发送API请求，模型配置面板的参数设置将被忽略。',
            )}
            icon={<AlertTriangle size={16} />}
            style={{ borderRadius: '12px' }}
            closeIcon={null}
          />

          {/* JSON编辑器 */}
          <div>
            <div className='flex items-center justify-between mb-2'>
              <Typography.Text strong style={{ fontSize: '14px', color: 'var(--hp-text)' }}>
                {t('请求体 JSON')}
              </Typography.Text>
              <div className='flex items-center gap-2'>
                {isValid ? (
                  <div className='flex items-center gap-1' style={{ color: 'var(--semi-color-success)' }}>
                    <Check size={14} />
                    <Typography.Text style={{ fontSize: '12px', color: 'var(--semi-color-success)' }}>
                      {t('格式正确')}
                    </Typography.Text>
                  </div>
                ) : (
                  <div className='flex items-center gap-1' style={{ color: 'var(--semi-color-danger)' }}>
                    <X size={14} />
                    <Typography.Text style={{ fontSize: '12px', color: 'var(--semi-color-danger)' }}>
                      {t('格式错误')}
                    </Typography.Text>
                  </div>
                )}
                <Button
                  theme='borderless'
                  type='tertiary'
                  size='small'
                  icon={<Edit size={14} />}
                  onClick={formatJson}
                  disabled={!isValid}
                  style={{ borderRadius: '12px', transition: 'all 0.2s ease' }}
                >
                  {t('格式化')}
                </Button>
              </div>
            </div>

            <TextArea
              value={localValue}
              onChange={handleValueChange}
              placeholder='{"model": "gpt-4o", "messages": [...], ...}'
              autosize={{ minRows: 8, maxRows: 20 }}
              style={{
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                lineHeight: '1.5',
                borderRadius: '12px',
                borderColor: !isValid ? 'var(--semi-color-danger)' : undefined,
                fontSize: '13px',
              }}
            />

            {!isValid && errorMessage && (
              <Typography.Text type='danger' style={{ fontSize: '12px', marginTop: '4px', display: 'block' }}>
                {errorMessage}
              </Typography.Text>
            )}

            <Typography.Text style={{ fontSize: '12px', color: 'var(--hp-sub)', marginTop: '8px', display: 'block' }}>
              {t(
                '请输入有效的JSON格式的请求体。您可以参考预览面板中的默认请求体格式。',
              )}
            </Typography.Text>
          </div>
        </>
      )}
    </div>
  );
};

export default CustomRequestEditor;
;
