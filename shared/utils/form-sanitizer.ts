/**
 * Form Data Sanitizer Utility
 * 
 * Transforms form data by converting empty strings to null for specified fields.
 * This ensures consistent data before backend validation.
 * 
 * IMPORTANT: Use this in ALL form submissions to maintain data consistency.
 * 
 * Usage:
 * ```typescript
 * const sanitized = sanitizeFormData(formData, ['email', 'address', 'phone']);
 * ```
 */

export function sanitizeFormData<T extends Record<string, any>>(
  data: T,
  emptyStringFields: (keyof T)[] = []
): Partial<T> {
  const sanitized: any = {};
  
  Object.entries(data).forEach(([key, value]) => {
    // Convert empty strings to null for specified fields
    if (value === "" && emptyStringFields.includes(key as keyof T)) {
      sanitized[key] = null;
    }
    // Remove undefined, null, and empty string values that aren't explicitly allowed
    else if (value !== undefined && value !== null && value !== "") {
      sanitized[key] = value;
    }
  });
  
  return sanitized;
}

/**
 * Batch sanitize multiple form objects
 * Useful when processing multiple records
 */
export function sanitizeFormDataBatch<T extends Record<string, any>>(
  dataArray: T[],
  emptyStringFields: (keyof T)[] = []
): Partial<T>[] {
  return dataArray.map(data => sanitizeFormData(data, emptyStringFields));
}

/**
 * Get default empty values for a form
 * Helps maintain consistent form state initialization
 */
export function getDefaultFormValues<T extends Record<string, any>>(
  template: T,
  overrides?: Partial<T>
): Partial<T> {
  const defaults: any = {};
  
  Object.keys(template).forEach(key => {
    const value = template[key];
    
    // Set appropriate default based on value type
    if (typeof value === 'string') {
      defaults[key] = "";
    } else if (typeof value === 'number') {
      defaults[key] = 0;
    } else if (typeof value === 'boolean') {
      defaults[key] = false;
    } else if (Array.isArray(value)) {
      defaults[key] = [];
    } else if (typeof value === 'object' && value !== null) {
      defaults[key] = {};
    } else {
      defaults[key] = undefined;
    }
  });
  
  return { ...defaults, ...overrides };
}
