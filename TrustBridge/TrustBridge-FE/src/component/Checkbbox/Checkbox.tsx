import { Checkbox, type CheckboxProps } from '@chakra-ui/react';

interface CustomCheckboxProps extends CheckboxProps {
  color?: string;
  hoverColor?: string;
}

export const CheckBox = ({
  color = '',
  hoverColor = '',
  ...props
}: CustomCheckboxProps) => {
  return (
    <Checkbox
      sx={{
        '& .chakra-checkbox__control[data-checked]': {
          bg: color,
          borderColor: color,
        },
        '& .chakra-checkbox__control[data-checked]:hover': {
          bg: hoverColor,
          borderColor: hoverColor,
        },
      }}
      {...props}
    />
  );
};
