export type TagResponse = {
  tag_id: number;
  tag_name: string;
  created_at: string;
  updated_at: string;
};

export type CreateTagPayload = { tag_name: string };
export type UpdateTagPayload = { tag_name?: string };
export type TagFormValues = { tag_name: string };
