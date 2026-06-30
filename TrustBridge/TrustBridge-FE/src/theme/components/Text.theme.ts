import { defineStyleConfig } from '@chakra-ui/react';

export const TextTheme = defineStyleConfig({
  // sizes: {
  //   xl: {
  //     fontSize: '24px',
  //   },
  //   lg: {
  //     fontSize: '20px',
  //   },
  //   md: {
  //     fontSize: '18px',
  //   },
  //   sm: {
  //     fontSize: '14px',
  //   },
  //   xxl: {
  //     fontSize: '16px',
  //   },
  //   xs: {
  //     fontSize: '12px',
  //   },
  // },
  variants: {
    xs_thin: {
      lineHeight: '14.06px',
      fontWeight: 'thin',
      fontSize: 'xs',
    },

    xs_normal: {
      lineHeight: '14.06px',
      fontWeight: 'normal',
      fontSize: 'xs',
    },

    xs_semibold: {
      lineHeight: '14.06px',
      fontWeight: 'semibold',
      fontSize: 'xs',
    },
    xs_extrabold: {
      lineHeight: '14.06px',
      fontWeight: 'extrabold',
      fontSize: 'xs',
    },
    xs_medium: {
      lineHeight: '16px',
      fontWeight: 'medium',
      fontSize: 'xs',
    },
    // Variants for 'sm'
    sm_thin: {
      lineHeight: '16.41px',
      fontWeight: 'thin',
      fontSize: 'sm',
    },
    sm_normal: {
      lineHeight: '16.41px',
      fontWeight: 'normal',
      fontSize: 'sm',
    },
    sm_medium: {
      lineHeight: '20px',
      fontWeight: 'medium',
      fontSize: 'sm',
    },
    smm_medium: {
      lineHeight: '28px',
      fontWeight: 'medium',
      fontSize: 'ssm',
    },
    sm_semibold: {
      lineHeight: '16.41px',
      fontWeight: 'semibold',
      fontSize: 'sm',
    },
    sm_bold: {
      lineHeight: '16.41px',
      fontWeight: 'bold',
      fontSize: 'sm',
    },
    sm_extrabold: {
      lineHeight: '16.41px',
      fontWeight: 'extrabold',
      fontSize: 'sm',
    },

    // Variants for 'md'
    md_thin: {
      lineHeight: '18.75px',
      fontWeight: 'thin',
      fontSize: 'md',
    },
    md_normal: {
      lineHeight: '18.75px',
      fontWeight: 'normal',
      fontSize: 'md',
    },

    md_medium: {
      lineHeight: '18.75px',
      fontWeight: 'medium',
      fontSize: 'md',
    },
    md_semibold: {
      lineHeight: '18.75px',
      fontWeight: 'semibold',
      fontSize: 'md',
    },
    md_extrabold: {
      lineHeight: '18.75px',
      fontWeight: 'extrabold',
      fontSize: 'md',
    },

    // Variants for 'lg'
    lg_thin: {
      lineHeight: '23.44px',
      fontWeight: 'thin',
      fontSize: 'lg',
    },
    lg_normal: {
      lineHeight: '23.44px',
      fontWeight: 'normal',
      fontSize: 'lg',
    },
    lg_medium: {
      lineHeight: '23.44px',
      fontWeight: 'medium',
      fontSize: 'lg',
    },
    lg_semibold: {
      lineHeight: '23.44px',
      fontWeight: 'semibold',
      fontSize: 'lg',
    },
    lg_extrabold: {
      lineHeight: '23.44px',
      fontWeight: 'extrabold',
      fontSize: 'lg',
    },

    lgg_bold: {
      lineHeight: '28px',
      fontWeight: 'bold',
      fontSize: 'lgg',
    },
    lgg_normal: {
      lineHeight: '28px',
      fontWeight: 'normal',
      fontSize: 'lgg',
    },
    lgg_medium: {
      lineHeight: '28px',
      fontWeight: 'medium',
      fontSize: 'lgg',
    },
    // variant for 'xl'
    xl_thin: {
      lineHeight: '23.44px',
      fontWeight: 'thin',
      fontSize: 'xl',
    },
    xl_normal: {
      lineHeight: '23.44px',
      fontWeight: 'normal',
      fontSize: 'xl',
    },
    xl_medium: {
      lineHeight: '36px',
      fontWeight: 'medium',
      fontSize: 'xl',
    },
    xl_semibold: {
      lineHeight: '23.44px',
      fontWeight: 'semibold',
      fontSize: 'xl',
    },
    xl_bold: {
      lineHeight: '23.44px',
      fontWeight: 'bold',
      fontSize: 'xl',
    },
    xl_extrabold: {
      lineHeight: '23.44px',
      fontWeight: 'extrabold',
      fontSize: 'xl',
    },
    title: {
      fontSize: '48px',
      fontWeight: 'bold',
      lineHeight: '57.6px',
    },
    pageHeader: {
      fontSize: '32px',
      fontWeight: 'medium',
    },
    // variant for 'body'
    body_light: {
      fontSize: 'body',
      fontWeight: 'light',
    },
    body_normal: {
      fontSize: 'body',
      fontWeight: 'normal',
    },
    body_semibold: {
      fontSize: 'body',
      fontWeight: 'semibold',
    },

    body_medium: {
      fontSize: 'body',
      fontWeight: 'medium',
      lineHeight: '24px',
    },
    body_bold: {
      fontWeight: 'bold',
      fontSize: '32px',
      lineHeight: '100%',
    },
    xxl_medium: {
      lineHeight: '40px',
      fontWeight: 'medium',
      fontSize: 'xxl',
    },
    xxl_bold: {
      fontWeight: 'bold',
      fontSize: 'xxl',
    },

    xxl_semibold: {
      fontWeight: 'semibold',
      fontSize: 'xxl',
    },

    xxxl_semibold: {
      fontWeight: 'semibold',
      fontSize: 'xxxl',
      lineHeight: '54px',
    },
    xxxxl_medium: {
      fontWeight: 'medium',
      fontSize: 'xxxxl',
      lineHeight: '52px',
    },

    xxll_medium: {
      fontWeight: 'medium',
      fontSize: 'xxll',
      lineHeight: '52px',
    },
  },
});
