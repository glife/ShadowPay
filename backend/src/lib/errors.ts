export type HttpError = Error & { statusCode?: number };

export const fail = (message: string, statusCode = 400): HttpError =>
  Object.assign(new Error(message), { statusCode });

export const toErrorResponse = (error: unknown) => {
  const err = error as HttpError;
  return {
    status: err.statusCode || 500,
    body: { error: err.message || "Internal Server Error" },
  };
};
