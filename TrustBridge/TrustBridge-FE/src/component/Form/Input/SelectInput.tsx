import { Flex } from '@chakra-ui/react';
import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';
import Select, { type SingleValue } from 'react-select';
import type { SelectProps } from './Select.types';
import { FormWrapper } from '../Wrapper/FormWrapper';
import { ArrowDown } from '../../../assets/svgs';
import { THEME_COLORS } from '../../../theme/colors';

export const SelectInput = ({
  name,
  label,
  selectOption,
  isRequired,
  isSearchable,
  isClearable,
  menuPosition,
  onChange: customOnChange,
  isDisabled,
  ...rest
}: SelectProps) => {
  const { control } = useFormContext();

  const {
    field: { onChange: fieldOnChange, onBlur, ref, value },
    fieldState: { error },
  } = useController({
    control,
    name,
  });

  const handleChange = (
    option: SingleValue<{
      label: string;
      value: string | boolean | number;
    }>,
  ) => {
    fieldOnChange(option?.value ?? null);

    if (typeof customOnChange === 'function') {
      customOnChange(option?.value ?? null);
    }
  };

  return (
    <FormWrapper
      error={error as FieldError}
      label={label}
      isRequired={isRequired}
    >
      <Flex width={'100%'}>
        <Select
          isDisabled={isDisabled}
          options={selectOption}
          components={{
            IndicatorSeparator: () => null,
            DropdownIndicator: () => {
              return (
                <ArrowDown
                  color={
                    !isDisabled
                      ? THEME_COLORS.primary[800]
                      : THEME_COLORS.primary[300]
                  }
                />
              );
            },
          }}
          onBlur={onBlur}
          ref={ref}
          defaultValue={selectOption?.filter((item) => item.value == value)[0]}
          isSearchable={isSearchable}
          value={selectOption?.filter((item) => item.value === value)[0]}
          onChange={handleChange}
          isClearable={!!isClearable}
          menuPosition={menuPosition ?? 'fixed'}
          styles={{
            container: (baseStyles) => ({
              ...baseStyles,
              width: '100%',
              fontSize: '14px',
            }),
            placeholder: (baseStyles) => ({
              ...baseStyles,
              color: THEME_COLORS.primary[1400],
              fontSize: '14px',
            }),

            control: (baseStyles) => ({
              ...baseStyles,
              padding: '4px',
              width: '100%',
              background: 'white',
              borderColor: error ? 'red' : THEME_COLORS.primary[1200],
              boxShadow: 'none',
              borderRadius: '12px',

              ':hover': {
                borderColor: THEME_COLORS.primary[1200],
              },
            }),
          }}
          {...rest}
        />
      </Flex>
    </FormWrapper>
  );
};
