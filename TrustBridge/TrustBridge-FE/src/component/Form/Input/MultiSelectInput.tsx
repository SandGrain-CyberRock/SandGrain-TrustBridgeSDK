import { Flex } from '@chakra-ui/react';
import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';
import Select, { type MultiValue } from 'react-select';
import { FormWrapper } from '../Wrapper/FormWrapper';
import { THEME_COLORS } from '../../../theme/colors';

type Option = { label: string; value: string | number };

type MultiSelectInputProps = {
  name: string;
  label?: string;
  isRequired?: boolean;
  isSearchable?: boolean;
  options: Option[];
  placeholder?: string;
  isDisabled?: boolean;
  menuPosition?: 'absolute' | 'fixed';
};

export const MultiSelectInput = ({
  name,
  label,
  isRequired,
  isSearchable = true,
  options,
  placeholder,
  isDisabled,
  menuPosition = 'fixed',
}: MultiSelectInputProps) => {
  const { control } = useFormContext();

  const {
    field: { onChange, onBlur, ref, value },
    fieldState: { error },
  } = useController({ control, name });

  const selectedValues: (string | number)[] = Array.isArray(value) ? value : [];
  const selectedOptions = options.filter((o) =>
    selectedValues.includes(o.value),
  );

  const handleChange = (selected: MultiValue<Option>) => {
    onChange(selected ? selected.map((o) => o.value) : []);
  };

  return (
    <FormWrapper
      error={error as FieldError}
      label={label}
      isRequired={isRequired}
    >
      <Flex width="100%">
        <Select
          isMulti
          isDisabled={isDisabled}
          options={options}
          value={selectedOptions}
          onChange={handleChange}
          onBlur={onBlur}
          ref={ref}
          isSearchable={isSearchable}
          placeholder={placeholder}
          menuPosition={menuPosition}
          styles={{
            container: (base) => ({ ...base, width: '100%', fontSize: '14px' }),
            placeholder: (base) => ({
              ...base,
              color: THEME_COLORS.primary[1400],
              fontSize: '14px',
            }),
            control: (base) => ({
              ...base,
              padding: '4px',
              width: '100%',
              background: 'white',
              borderColor: error ? 'red' : THEME_COLORS.primary[1200],
              boxShadow: 'none',
              borderRadius: '12px',
              ':hover': { borderColor: THEME_COLORS.primary[1200] },
            }),
            multiValue: (base) => ({
              ...base,
              borderRadius: '8px',
              background: THEME_COLORS.primary[1200],
            }),
          }}
        />
      </Flex>
    </FormWrapper>
  );
};
