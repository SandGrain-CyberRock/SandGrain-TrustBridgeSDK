export type CategoryResponse = {
  category_id: number;
  category_name: string;
  created_at: string;
  updated_at: string;
};

export type CreateCategoryPayload = {
  category_name: string;
};

export type UpdateCategoryPayload = {
  category_name?: string;
};

export type CategoryFormValues = {
  category_name: string;
};
