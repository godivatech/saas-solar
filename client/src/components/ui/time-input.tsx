import React, { useState, useEffect } from 'react';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
// DEPRECATED: 24-hour conversion functions no longer needed
// Component now works exclusively with 12-hour format

interface TimeInputProps {
  value: string; // 12-hour format (h:mm AM/PM)
  onChange: (value: string) => void; // Returns 12-hour format
  className?: string;
  placeholder?: string;
}

export function TimeInput({ value, onChange, className, placeholder }: TimeInputProps) {
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');

  // Parse 12-hour value to components
  useEffect(() => {
    if (value) {
      const timeRegex = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
      const match = value.match(timeRegex);
      
      if (match) {
        const [, h, m, p] = match;
        setHour(h);
        setMinute(m);
        setPeriod(p.toUpperCase());
      } else {
        // Legacy 24-hour format fallback
        const [h, m] = value.split(':');
        const hour24 = parseInt(h);
        const displayHour = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        const displayPeriod = hour24 >= 12 ? 'PM' : 'AM';
        
        setHour(displayHour.toString());
        setMinute(m);
        setPeriod(displayPeriod);
      }
    }
  }, [value]);

  // Update parent with 12-hour format when components change (Enterprise standard)
  const updateTime = (newHour: string, newMinute: string, newPeriod: string) => {
    const time12 = `${newHour}:${newMinute} ${newPeriod}`;
    onChange(time12); // Return 12-hour format directly
  };

  const handleHourChange = (newHour: string) => {
    setHour(newHour);
    updateTime(newHour, minute, period);
  };

  const handleMinuteChange = (newMinute: string) => {
    setMinute(newMinute);
    updateTime(hour, newMinute, period);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    updateTime(hour, minute, newPeriod);
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Select value={hour} onValueChange={handleHourChange}>
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 12 }, (_, i) => (
            <SelectItem key={i + 1} value={(i + 1).toString()}>
              {i + 1}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <span className="text-lg font-mono">:</span>
      
      <Select value={minute} onValueChange={handleMinuteChange}>
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {Array.from({ length: 60 }, (_, i) => {
            const min = i.toString().padStart(2, '0');
            return (
              <SelectItem key={min} value={min}>
                {min}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      
      <Select value={period} onValueChange={handlePeriodChange}>
        <SelectTrigger className="w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}