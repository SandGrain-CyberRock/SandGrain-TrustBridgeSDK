import { IconsList } from '../../constant/Icons';

export type SidebarProps = {
  onToggle: () => void;
};

export type IconsListType = typeof IconsList;
export type IconKey = keyof IconsListType;
