/**
 * Enterprise Time Input Component
 * Standardized 12-hour format input with validation
 */

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { is12HourFormat } from './time-display';

interface TimeInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
}

export function TimeInput({
  label,
  value,
  onChange,
  placeholder = "9:00 AM",
  disabled = false,
  required = false,
  className = "",
  error
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    // System now exclusively uses 12-hour format
    if (value && is12HourFormat(value)) {
      setInputValue(value);
    } else if (value) {
      console.warn('Invalid time format received:', value);
      setInputValue('');
    } else {
      setInputValue(value);
    }
  }, [value]);

  const validateTime = (timeString: string): boolean => {
    if (!timeString.trim()) return !required;
    
    const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
    const match = timeString.match(timeRegex);
    
    if (!match) return false;
    
    const [, hourStr, minuteStr] = match;
    const hours = parseInt(hourStr);
    const minutes = parseInt(minuteStr);
    
    return hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59;
  };

  const handleTimeChange = (newValue: string) => {
    setInputValue(newValue);
    const valid = validateTime(newValue);
    setIsValid(valid);
    
    if (valid && newValue.trim()) {
      // System now uses 12-hour format throughout
      onChange(newValue);
    } else if (!newValue.trim()) {
      onChange('');
    }
  };

  const handleTimePreset = (presetTime: string) => {
    setInputValue(presetTime);
    setIsValid(true);
    // System now uses 12-hour format throughout
    onChange(presetTime);
  };

  const formatInput = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (!value) return;
    
    // Auto-format common inputs
    let formatted = value.toUpperCase();
    
    // Add AM/PM if missing
    if (/^\d{1,2}:\d{2}$/.test(formatted)) {
      const [hours] = formatted.split(':');
      const hour = parseInt(hours);
      formatted += hour < 12 ? ' AM' : ' PM';
    }
    
    // Add minutes if missing
    if (/^\d{1,2}\s*(AM|PM)$/i.test(formatted)) {
      const parts = formatted.split(/\s+/);
      formatted = `${parts[0]}:00 ${parts[1]}`;
    }
    
    handleTimeChange(formatted);
  };

  return (
    <div className={className}>
      {label && (
        <Label className="text-sm font-medium mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          <Clock className="h-4 w-4 text-gray-400" />
        </div>
        
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => handleTimeChange(e.target.value)}
          onBlur={formatInput}
          placeholder={placeholder}
          disabled={disabled}
          className={`pl-10 ${!isValid || error ? 'border-red-500' : ''}`}
        />
      </div>
      
      {/* Quick presets */}
      <div className="flex gap-2 mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleTimePreset('9:00 AM')}
          disabled={disabled}
          className="text-xs"
        >
          9:00 AM
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleTimePreset('6:00 PM')}
          disabled={disabled}
          className="text-xs"
        >
          6:00 PM
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleTimePreset('12:00 PM')}
          disabled={disabled}
          className="text-xs"
        >
          12:00 PM
        </Button>
      </div>
      
      {(!isValid || error) && (
        <p className="text-red-500 text-xs mt-1">
          {error || 'Please enter a valid time in 12-hour format (e.g., 9:00 AM)'}
        </p>
      )}
      
      <p className="text-gray-500 text-xs mt-1">
        Format: h:mm AM/PM (e.g., 9:00 AM, 6:30 PM)
      </p>
    </div>
  );
}