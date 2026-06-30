export type SubCategoryResponse = {
  sub_category_id: number;
  sub_category_name: string;
  category_id: number;
  category?: { category_id: number; category_name: string };
  created_at: string;
  updated_at: string;
};

export type CreateSubCategoryPayload = {
  sub_category_name: string;
  category_id: number;
};

export type UpdateSubCategoryPayload = {
  sub_category_name?: string;
  category_id?: number;
};

export type SubCategoryFormValues = {
  sub_category_name: string;
  category_id: string;
};
