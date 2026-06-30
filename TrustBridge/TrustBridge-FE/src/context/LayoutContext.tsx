import { createContext, useContext } from 'react';

interface LayoutContextProps {
  sidebarWidth: number;
  isCollapsed: boolean;
}

export const LayoutContext = createContext<LayoutContextProps>({
  sidebarWidth: 0,
  isCollapsed: false,
});

export const useLayoutContext = () => useContext(LayoutContext);
