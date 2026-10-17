import React from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';

const customStyles = {
  control: (provided, state) => ({
    ...provided,
    backgroundColor: 'var(--surface)',
    borderColor: state.isFocused ? 'var(--primary)' : 'var(--border)',
    boxShadow: state.isFocused ? '0 0 0 3px var(--primary-light)' : 'none',
    borderRadius: '8px',
    minHeight: '38px',
    height: '38px',
    padding: '0 4px',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer'
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
    zIndex: 9999
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected 
      ? 'var(--primary)' 
      : state.isFocused 
        ? 'var(--surface-hover)' 
        : 'transparent',
    color: state.isSelected ? 'white' : 'var(--text-main)',
    cursor: 'pointer',
    padding: '8px 12px',
    fontSize: '0.85rem',
    transition: 'background-color 0.2s',
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'var(--text-main)',
  }),
  input: (provided) => ({
    ...provided,
    color: 'var(--text-main)',
  }),
  placeholder: (provided) => ({
    ...provided,
    color: 'var(--text-muted)',
  }),
  indicatorSeparator: () => ({ display: 'none' })
};

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  style,
  isAsync = false,
  loadOptions,
  defaultOptions = true
}) {
  if (isAsync && loadOptions) {
    // When value is primitive ID or string, find in options or display fallback
    const selectedOption = options?.find(opt => opt.value === value) || (value ? { value, label: `Tanlangan (#${value})` } : null);

    return (
      <div style={style}>
        <AsyncSelect
          cacheOptions
          defaultOptions={defaultOptions}
          loadOptions={loadOptions}
          value={selectedOption}
          onChange={(selected) => onChange(selected ? selected.value : '', selected)}
          placeholder={placeholder || 'Qidirish va tanlash...'}
          isDisabled={disabled}
          styles={customStyles}
          isClearable
          menuPosition="fixed"
        />
      </div>
    );
  }

  // convert simple value to object for react-select
  const selectedOption = options?.find(opt => opt.value === value) || null;

  return (
    <div style={style}>
      <Select
        value={selectedOption}
        onChange={(selected) => onChange(selected ? selected.value : '')}
        options={options}
        placeholder={placeholder || 'Tanlash...'}
        isDisabled={disabled}
        styles={customStyles}
        isClearable
        isSearchable
        menuPosition="fixed"
      />
    </div>
  );
}
