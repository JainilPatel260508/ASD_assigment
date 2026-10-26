export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requiredRecord(record, kind) {
  if (!record) throw new HttpError(404, `${kind} not found`);
  return record;
}

export async function writeRecord(operation, kind, mappings = {}) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === 'P2025') throw new HttpError(404, `${kind} not found`);
    if (mappings[error.code]) {
      const [status, message] = mappings[error.code];
      throw new HttpError(status, message);
    }
    throw error;
  }
}
