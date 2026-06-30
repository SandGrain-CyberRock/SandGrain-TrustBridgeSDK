import { useSearchParams } from 'react-router-dom';
import type { MODAL_VIEW_TYPE } from '../constant/ModalViewType';

export const useModalSearchParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const modalOpen = (
    id: string,
    type: string,
    extraParams?: { key: string; value: string }[],
  ) => {
    if (type === 'delete') {
      searchParams.set('deleteId', id);
    } else {
      searchParams.set('id', id);
    }
    searchParams.set('type', type);
    if (extraParams?.length) {
      extraParams.map((e) => {
        searchParams.set(e.key, e.value);
      });
    }
    setSearchParams(searchParams, { replace: true });
  };

  const modalClose = () => {
    searchParams.delete('id');
    searchParams.delete('deleteId');
    searchParams.delete('type');
    searchParams.delete('start_date');
    searchParams.delete('end_date');
    searchParams.delete('weekday');
    setSearchParams(searchParams, { replace: true });
  };

  const addModalOpen = (addName?: string) => {
    searchParams.delete('id');
    searchParams.delete('deleteId');

    if (typeof addName === 'string') {
      searchParams.set('type', addName);
    } else {
      searchParams.set('type', 'add');
    }
    setSearchParams(searchParams, { replace: true });
  };

  const changeModalOpen = () => {
    searchParams.set('type', 'change');
    setSearchParams(searchParams, { replace: true });
  };

  const shouldOpen = (type: keyof typeof MODAL_VIEW_TYPE) => {
    const viewType = searchParams.get('type');
    return type === viewType;
  };

  const modalCloseFilter = () => {
    const updatedParams = new URLSearchParams(searchParams);

    updatedParams.delete('type');
    setSearchParams(updatedParams);
  };

  return {
    modalClose,
    modalOpen,
    addModalOpen,
    searchParams,
    setSearchParams,
    shouldOpen,
    changeModalOpen,
    modalCloseFilter,
  };
};
