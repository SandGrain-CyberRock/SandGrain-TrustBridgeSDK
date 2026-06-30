import {
  get,
  useController,
  useFormContext,
  type FieldError,
} from 'react-hook-form';
import {
  Input as ChakraInput,
  InputGroup,
  InputLeftElement,
  InputRightElement,
} from '@chakra-ui/react';
import type { TextFieldInputProps } from './Input.types';
import { FormWrapper } from '../Wrapper/FormWrapper';
import { Icon } from '../../Icon';
import type { ChangeEvent } from 'react';
import { ThemeVariantEnum } from '../../../enums';

export const TextFieldInput = ({
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
  onRightIconClick,
  type,
  tooltip,
  maxLength,
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

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    if (handleChange) {
      handleChange(value);

      trigger(name);
    } else onChange(event);

    triggers?.map((name) => trigger(name));
  };

  return (
    <FormWrapper
      label={label}
      error={get(errors, name) as FieldError}
      isRequired={isRequired}
      tooltip={tooltip}
    >
      <InputGroup>
        {leftIcon && (
          <InputLeftElement>
            <Icon name={leftIcon} />
          </InputLeftElement>
        )}
        <ChakraInput
          type={type || 'text'}
          variant={variant}
          placeholder={placeholder}
          maxLength={maxLength}
          ref={ref}
          value={value}
          onChange={isDisabled ? undefined : handleInputChange}
          isDisabled={isDisabled}
          onBlur={onBlur}
          py={'14px'}
          px={'12px'}
          paddingRight={rightIcon ? '36px' : undefined}
          paddingLeft={leftIcon ? '36px' : undefined}
          background="white"
          borderColor="primary.1200"
          borderRadius="12px"
          fontSize="14px"
          _hover={{
            borderColor: 'primary.1200',
          }}
          _focus={{
            borderColor: 'primary.1200',
            boxShadow: 'none',
          }}
        />

        {rightIcon && (
          <InputRightElement onClick={onRightIconClick} cursor={'pointer'}>
            <Icon name={rightIcon} />
          </InputRightElement>
        )}
      </InputGroup>
    </FormWrapper>
  );
};
