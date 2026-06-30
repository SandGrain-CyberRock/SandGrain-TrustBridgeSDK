import type { ComponentStyleConfig } from '@chakra-ui/theme';

export const DatePickerTheme: ComponentStyleConfig = {
  baseStyle: {
    today: {
      color: 'white',
    },
    otherDates: {
      color: 'black',
      padding: '0px 10px',
      borderRadius: '50%',
    },
  },
  defaultProps: {
    size: 'md',
  },
};
