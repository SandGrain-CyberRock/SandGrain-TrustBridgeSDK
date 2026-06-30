import { Box } from '@chakra-ui/react';
import type { IconProps } from './Icon.types';
import { IconsList } from '../../constant/Icons';

export const Icon = ({
  name,
  width,
  height,
  color,
  cursor,
  bgColor,

  onClick,
}: IconProps) => {
  const ActiveIcon = name && IconsList[name];

  if (!ActiveIcon) return null;

  return (
    <Box
      sx={{
        svg: {
          width,
          height,
        },
      }}
      color={color}
      bg={bgColor}
      onClick={onClick}
      cursor={cursor}
    >
      <ActiveIcon />
    </Box>
  );
};
