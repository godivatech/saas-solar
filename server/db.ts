// This file is kept for backward compatibility during the Firestore migration
// It provides a no-op implementation for any code still expecting the PostgreSQL connection

console.log("PostgreSQL connection is deprecated - using Firestore instead");

// Mock objects to prevent errors in case any code is still using these
export const pool = {
  connect: () => Promise.resolve(null),
  query: () => Promise.resolve({ rows: [] }),
  end: () => Promise.resolve(),
};

export const db = {
  select: () => ({ from: () => Promise.resolve([]) }),
  insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
  delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
};
