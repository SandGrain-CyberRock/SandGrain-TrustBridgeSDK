import { defineStyleConfig } from '@chakra-ui/react';

// Commented part for secondary color, no secondar colors in design

export const ButtonTheme = defineStyleConfig({
  // Styles for the base style
  baseStyle: {
    borderRadius: '10px',
    color: 'black',
    fontWeight: '500',
    fontStyle: 'normal',
  },
  // Styles for the size variations
  sizes: {
    sm: {
      fontSize: '14px',
      px: '12px',
      py: '8px',
      lineHeight: '20px',
    },
    md: {
      fontSize: '14px',
      px: '16px',
      py: '10px',
      lineHeight: '24px',
    },
    lg: {
      fontSize: '14px',
      px: '20px',
      py: '12px',
      lineHeight: '28px',
    },
  },
  // Styles for the visual style variations
  variants: {
    primary: {
      background: 'orange.2500',
      border: '1px solid white',
      color: 'white',
      borderRadius: '12px',
      _hover: {
        color: 'light',
        background: 'orange.800',
        borderColor: 'white',
        svg: { stroke: 'black' },
        _disabled: { color: 'white', background: 'brand.400' },
      },
    },
    secondary: {
      background: 'orange.2300',
      paddingX: '30px',
      border: '1px solid white',
      borderColor: 'bgSecondary.1200',
      color: 'orange.2500',
      _hover: {
        color: 'primary.700',
        background: 'primary.200',
        borderColor: 'white',
        _disabled: {
          color: 'primary.800',
          background: 'primary.50',
          borderColor: 'primary.700',
        },
      },
    },

    bg_secondary: {
      background: 'bgSecondary.600',
      color: '#000',
    },
    outline: {
      background: 'gray.25',
      border: '1px solid',
      borderColor: '#EBEBEB',
      borderRadius: '12px',
    },
    cancel: {
      background: 'gray.25',
      border: '2px solid',
      borderColor: 'orange.2500',
      textColor: 'orange.2500',
      borderRadius: '12px',
    },
    bg_mango: {
      background: 'orange.600',
      color: '#000',
      _hover: {
        color: '#000',
        background: 'orange.400',
        borderColor: 'white',
        svg: { stroke: 'black' },
        _disabled: { color: 'white', background: 'brand.400' },
      },
    },
    primary_large: {
      background: 'brand.600',
      paddingX: '30px',
      border: '1px solid white',
      borderRadius: '32px',
      width: '161px',
      borderColor: 'gray.100',
      color: 'white',
      _hover: {
        color: 'primary.700',
        background: 'primary.200',
        borderColor: 'gray.200',
        _disabled: {
          color: 'primary.800',
          background: 'primary.50',
          borderColor: 'primary.700',
        },
      },
    },
    primary_large_outline: {
      background: 'brand.100',
      border: '1.25px solid',
      borderRadius: '32px',
      borderColor: 'gray.200',
      width: '161px',
      _hover: {
        color: 'primary.700',
        background: 'primary.200',
        borderColor: 'gray.200',
        _disabled: {
          color: 'primary.800',
          background: 'primary.50',
          borderColor: 'primary.700',
        },
      },
    },

    extra_themed: {
      background: 'transparent',
      border: '1.25px dashed',
      borderRadius: '8px',
      borderColor: 'secondary.600',
      color: 'secondary.600',
      width: '161px',
      _hover: {
        borderColor: 'gray.200',
      },
    },

    icon_button_next: {
      background: 'gray.1000',
      border: 'none',
      borderTopRightRadius: '6px',
      borderBottomRightRadius: '6px',
      borderTopLeftRadius: '0px',
      borderBottomLeftRadius: '0px',
      p: '4px',

      width: '28px',
    },

    icon_button_prev: {
      background: 'gray.1000',
      border: 'none',
      borderTopRightRadius: '0px',
      borderBottomRightRadius: '0px',
      borderTopLeftRadius: '6px',
      borderBottomLeftRadius: '6px',
      p: '4px',

      width: '28px',
    },

    ghost: {
      p: '2px',
    },
    primary_round: {
      background: 'brand.600',
      paddingX: '30px',
      border: '1px solid white',
      borderRadius: '24px',
      width: '116px',
      borderColor: 'gray.100',
      color: 'white',
      _hover: {
        color: 'brand.300',
        background: 'brand.500',
        borderColor: 'gray.200',
        _disabled: {
          color: 'primary.800',
          background: 'primary.50',
          borderColor: 'primary.700',
        },
      },
    },
  },

  // The default `size` or `variant` values
  defaultProps: {
    size: 'md',
    variant: 'primary',
  },
});
