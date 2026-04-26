import React, { useState, useEffect, useRef } from 'react';
import { Search, User, X, AlertTriangle } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  address: string;
  propertyType?: string;
  ebServiceNumber?: string;
  tariffCode?: string;
  ebSanctionPhase?: string;
  ebSanctionKW?: string;
  location?: string;
  displayText: string;
}

interface CustomerAutocompleteProps {
  value: {
    name: string;
    mobile?: string;
    address?: string;
    email?: string;
    propertyType?: string;
    ebServiceNumber?: string;
    tariffCode?: string;
    ebSanctionPhase?: string;
    ebSanctionKW?: string;
    location?: string;
  };
  onChange: (customer: {
    id?: string;
    name: string;
    mobile: string;
    address: string;
    email?: string;
    propertyType?: string;
    ebServiceNumber?: string;
    tariffCode?: string;
    ebSanctionPhase?: string;
    ebSanctionKW?: string;
    location?: string;
  }) => void;
  onDuplicateDetected?: (existingCustomer: Customer | null) => void;
  onCustomerSelected?: (customerId: string) => void;
  placeholder?: string;
  className?: string;
}

const CustomerAutocomplete: React.FC<CustomerAutocompleteProps> = ({
  value,
  onChange,
  onDuplicateDetected,
  onCustomerSelected,
  placeholder = "Start typing customer name...",
  className
}) => {
  const [query, setQuery] = useState(value.name || '');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [duplicateCustomer, setDuplicateCustomer] = useState<Customer | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const duplicateCheckRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Search customers API call
  const searchCustomers = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.error('No authenticated user found');
        setSuggestions([]);
        return;
      }

      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
        console.log('Found customers:', data.length);
      } else {
        console.error('Customer search failed:', response.status, response.statusText);
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Error searching customers:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Normalize mobile number - remove non-digits, handle +91/0 prefixes
  const normalizeMobileNumber = (mobile: string): string => {
    if (!mobile) return '';
    
    // Remove all non-digit characters
    let normalized = mobile.replace(/\D/g, '');
    
    // Handle Indian mobile formats
    if (normalized.startsWith('91') && normalized.length === 12) {
      // Remove country code +91
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('0') && normalized.length === 11) {
      // Remove leading zero
      normalized = normalized.substring(1);
    }
    
    return normalized;
  };

  // Check for duplicate mobile number
  const checkDuplicateMobile = async (mobile: string) => {
    const normalizedMobile = normalizeMobileNumber(mobile);
    
    if (!normalizedMobile || normalizedMobile.length < 10) {
      setDuplicateCustomer(null);
      onDuplicateDetected?.(null);
      return;
    }

    setIsCheckingDuplicate(true);
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.error('No authenticated user found');
        return;
      }

      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/customers/check-mobile/${encodeURIComponent(normalizedMobile)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.exists) {
          console.log('Duplicate customer found:', data.customer.name);
          setDuplicateCustomer(data.customer);
          onDuplicateDetected?.(data.customer);
        } else {
          console.log('No duplicate customer found');
          setDuplicateCustomer(null);
          onDuplicateDetected?.(null);
        }
      } else {
        console.error('Duplicate check failed:', response.status, response.statusText);
        setDuplicateCustomer(null);
        onDuplicateDetected?.(null);
      }
    } catch (error) {
      console.error('Error checking duplicate mobile:', error);
      setDuplicateCustomer(null);
      onDuplicateDetected?.(null);
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchCustomers(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Debounced mobile duplicate check
  useEffect(() => {
    if (duplicateCheckRef.current) {
      clearTimeout(duplicateCheckRef.current);
    }

    if (value.mobile && value.mobile.length >= 10) {
      duplicateCheckRef.current = setTimeout(() => {
        checkDuplicateMobile(value.mobile!);
      }, 500);
    } else {
      setDuplicateCustomer(null);
      onDuplicateDetected?.(null);
    }

    return () => {
      if (duplicateCheckRef.current) {
        clearTimeout(duplicateCheckRef.current);
      }
    };
  }, [value.mobile]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setShowSuggestions(true);
    setSelectedCustomer(null);
    
    // Update form data with manual input (preserve existing fields)
    onChange({
      name: newValue,
      mobile: value.mobile || '',
      address: value.address || '',
      email: value.email || '',
      propertyType: value.propertyType || '',
      ebServiceNumber: value.ebServiceNumber || '',
      tariffCode: value.tariffCode || '',
      ebSanctionPhase: value.ebSanctionPhase || '',
      ebSanctionKW: value.ebSanctionKW || '',
      location: value.location || ''
    });
  };

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer) => {
    setQuery(customer.name);
    setSelectedCustomer(customer);
    setShowSuggestions(false);
    
    // Auto-fill all customer details including ID and additional fields
    onChange({
      id: customer.id,
      name: customer.name,
      mobile: customer.mobile || '',
      address: customer.address || '',
      email: customer.email || '',
      propertyType: customer.propertyType || '',
      ebServiceNumber: customer.ebServiceNumber || '',
      tariffCode: customer.tariffCode || '',
      ebSanctionPhase: customer.ebSanctionPhase || '',
      ebSanctionKW: customer.ebSanctionKW || '',
      location: customer.location || ''
    });
    
    // Notify parent component about customer selection
    if (onCustomerSelected) {
      onCustomerSelected(customer.id);
    }
  };

  // Clear selection
  const handleClear = () => {
    setQuery('');
    setSelectedCustomer(null);
    setSuggestions([]);
    setShowSuggestions(false);
    onChange({
      name: '',
      mobile: '',
      address: '',
      email: '',
      propertyType: '',
      ebServiceNumber: '',
      tariffCode: '',
      ebSanctionPhase: '',
      ebSanctionKW: '',
      location: ''
    });
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (value.name !== query) {
      setQuery(value.name || '');
    }
  }, [value.name]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="pl-10 pr-10"
          onFocus={() => setShowSuggestions(true)}
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1 h-8 w-8 p-0"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (query.length >= 2 || suggestions.length > 0) && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 shadow-lg">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                Searching customers...
              </div>
            ) : suggestions.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                {suggestions.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                    onClick={() => handleCustomerSelect(customer)}
                  >
                    <div className="flex-shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {customer.displayText}
                      </p>
                      {customer.address && (
                        <p className="text-xs text-muted-foreground truncate">
                          {customer.address}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : query.length >= 2 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                No customers found. A new customer will be created.
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Selected customer indicator */}
      {selectedCustomer && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 rounded-md border border-green-200">
          <User className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-800">
            Customer details auto-filled from database
          </span>
        </div>
      )}

      {/* Duplicate customer warning */}
      {duplicateCustomer && !selectedCustomer && (
        <div className="mt-2 flex items-center gap-2 p-3 bg-yellow-50 rounded-md border border-yellow-200" data-testid="duplicate-customer-warning">
          <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              Mobile number already exists
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              This mobile number belongs to <strong>{duplicateCustomer.name}</strong>. 
              Creating a customer will update their information instead of creating a new record.
            </p>
          </div>
        </div>
      )}

      {/* Loading indicator for duplicate check */}
      {isCheckingDuplicate && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-blue-50 rounded-md border border-blue-200">
          <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-blue-800">
            Checking for existing customer...
          </span>
        </div>
      )}
    </div>
  );
};

export default CustomerAutocomplete;