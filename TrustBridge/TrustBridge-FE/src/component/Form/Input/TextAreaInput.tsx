import {
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Textarea,
} from '@chakra-ui/react';
import type { TextFieldInputProps } from './Input.types';
import { ThemeVariantEnum } from '../../../enums';
import {
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';
import type { ChangeEvent } from 'react';
import { FormWrapper } from '../Wrapper/FormWrapper';
import { Icon } from '../../Icon';

export const TextAreaInput = ({
  variant = ThemeVariantEnum.DEFAULT_INPUT_VARIANT,
  name,
  handleChange,
  isDisabled,
  isRequired,
  label,
  placeholder,
  triggers,
  leftIcon,
  rightIcon,
}: TextFieldInputProps) => {
  const {
    control,
    formState: { errors },
    trigger,
  } = useFormContext();

  const {
    field: { onChange, onBlur, ref, value },
  } = useController({
    control,
    name,
  });

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;

    if (handleChange) {
      handleChange(value);
      trigger(name);
    } else {
      onChange(event);
    }

    triggers?.map((name) => trigger(name));
  };

  return (
    <FormWrapper
      label={label}
      error={errors?.[name] as FieldError}
      isRequired={isRequired}
    >
      <InputGroup position="relative">
        {leftIcon && (
          <InputLeftElement>
            <Icon name={leftIcon} />
          </InputLeftElement>
        )}
        <Textarea
          variant={variant}
          placeholder={placeholder}
          ref={ref}
          value={value}
          onChange={isDisabled ? undefined : handleInputChange}
          isDisabled={isDisabled}
          onBlur={onBlur}
          minHeight="120px"
          background="white"
          border="1px solid"
          borderColor="primary.1200"
          borderRadius="12px"
          _hover={{
            borderColor: 'primary.1200',
          }}
          _placeholder={{ fontSize: '14px', color: 'gray.400' }}
        />
        {rightIcon && (
          <InputRightElement>
            <Icon name={rightIcon} />
          </InputRightElement>
        )}
      </InputGroup>
    </FormWrapper>
  );
};
