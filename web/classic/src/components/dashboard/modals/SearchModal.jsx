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

import React, { useRef } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';

const SearchModal = ({
  searchModalVisible,
  handleSearchConfirm,
  handleCloseModal,
  isMobile,
  isAdminUser,
  inputs,
  dataExportDefaultTime,
  timeOptions,
  handleInputChange,
  t,
}) => {
  const formRef = useRef();

  const FORM_FIELD_PROPS = {
    style: {
      width: '100%',
      marginBottom: '0px',
      borderRadius: '8px',
    },
  };

  const createFormField = (Component, props) => (
    <Component {...FORM_FIELD_PROPS} {...props} />
  );

  const { start_timestamp, end_timestamp, username } = inputs;

  return (
    <Modal
      title={
        <span
          style={{
            fontWeight: 600,
            fontSize: '1rem',
            color: 'var(--hp-text)',
          }}
        >
          {t('搜索条件')}
        </span>
      }
      visible={searchModalVisible}
      onOk={handleSearchConfirm}
      onCancel={handleCloseModal}
      closeOnEsc={true}
      size={isMobile ? 'full-width' : 'small'}
      centered
      style={{ borderRadius: '16px', overflow: 'hidden' }}
      bodyStyle={{ padding: '20px 24px 8px' }}
    >
      <Form
        ref={formRef}
        layout='vertical'
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* 起始时间 */}
        {createFormField(Form.DatePicker, {
          field: 'start_timestamp',
          label: (
            <span
              style={{
                color: 'var(--hp-sub)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              {t('起始时间')}
            </span>
          ),
          initValue: start_timestamp,
          value: start_timestamp,
          type: 'dateTime',
          name: 'start_timestamp',
          onChange: value => handleInputChange(value, 'start_timestamp'),
        })}

        {/* 结束时间 */}
        {createFormField(Form.DatePicker, {
          field: 'end_timestamp',
          label: (
            <span
              style={{
                color: 'var(--hp-sub)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              {t('结束时间')}
            </span>
          ),
          initValue: end_timestamp,
          value: end_timestamp,
          type: 'dateTime',
          name: 'end_timestamp',
          onChange: value => handleInputChange(value, 'end_timestamp'),
        })}

        {/* 时间粒度 */}
        {createFormField(Form.Select, {
          field: 'data_export_default_time',
          label: (
            <span
              style={{
                color: 'var(--hp-sub)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              {t('时间粒度')}
            </span>
          ),
          initValue: dataExportDefaultTime,
          placeholder: t('时间粒度'),
          name: 'data_export_default_time',
          optionList: timeOptions,
          onChange: value =>
            handleInputChange(value, 'data_export_default_time'),
        })}

        {/* 用户名（仅管理员） */}
        {isAdminUser &&
          createFormField(Form.Input, {
            field: 'username',
            label: (
              <span
                style={{
                  color: 'var(--hp-sub)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                {t('用户名称')}
              </span>
            ),
            value: username,
            placeholder: t('可选值'),
            name: 'username',
            onChange: value => handleInputChange(value, 'username'),
          })}
      </Form>
    </Modal>
  );
};

export default SearchModal;
