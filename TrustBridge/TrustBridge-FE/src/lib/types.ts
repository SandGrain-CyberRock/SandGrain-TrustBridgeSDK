export type SuccessResponse<T> = {
  message: string;
  statusCode: number;
  data: T;
};

export type ErrorResponse = {
  response: {
    data: {
      message: string;
      error: string;
      statusCode: number;
    };
  };
};

export type SuccesRolesResponse<T> = {
  message: string;
  data: T;
};
