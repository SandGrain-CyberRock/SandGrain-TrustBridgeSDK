import type { JSX } from 'react';
import type { IconsListType } from '../component/Sidebar/Sidebar.types';

export interface Route {
  icon?: keyof IconsListType;
  name?: string;
  route?: string;
  isVisible?: boolean;
  element?: JSX.Element;
  children?: Route[];
  sectionHeading?: string;
  permissions?: string[];
}
