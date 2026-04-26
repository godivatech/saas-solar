import * as React from "react"
import { format, startOfDay, endOfDay, isValid, isBefore, isAfter, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays, subMonths, subQuarters, subYears } from "date-fns"
import { Calendar as CalendarIcon, AlertCircle, Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useIsMobile } from "@/hooks/use-mobile"

interface DatePickerProps {
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  label?: string
  className?: string
}

export function DatePicker({ date, setDate, label, className }: DatePickerProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      {label && <span className="text-sm font-medium">{label}</span>}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP") : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface DateRangePickerProps {
  dateRange: { from: Date | undefined; to: Date | undefined }
  setDateRange: React.Dispatch<
    React.SetStateAction<{
      from: Date | undefined
      to: Date | undefined
    }>
  >
  className?: string
  placeholder?: string
  maxRange?: number // Maximum days allowed in range
  minDate?: Date // Minimum selectable date
  maxDate?: Date // Maximum selectable date
  showPresets?: boolean // Show enterprise preset buttons
  onError?: (error: string) => void // Error callback
}

// Enterprise date range presets
const getEnterprisePresets = () => {
  const now = new Date()
  const today = startOfDay(now)

  return [
    {
      label: "Today",
      value: { from: today, to: endOfDay(now) },
      description: "Current day"
    },
    {
      label: "Yesterday",
      value: { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) },
      description: "Previous day"
    },
    {
      label: "This Week",
      value: { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) },
      description: "Monday to Sunday"
    },
    {
      label: "Last Week",
      value: { from: startOfWeek(subDays(now, 7), { weekStartsOn: 1 }), to: endOfWeek(subDays(now, 7), { weekStartsOn: 1 }) },
      description: "Previous week"
    },
    {
      label: "This Month",
      value: { from: startOfMonth(now), to: endOfMonth(now) },
      description: "Current month"
    },
    {
      label: "Last Month",
      value: { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) },
      description: "Previous month"
    },
    {
      label: "This Quarter",
      value: { from: startOfQuarter(now), to: endOfQuarter(now) },
      description: "Q1/Q2/Q3/Q4"
    },
    {
      label: "Last Quarter",
      value: { from: startOfQuarter(subQuarters(now, 1)), to: endOfQuarter(subQuarters(now, 1)) },
      description: "Previous quarter"
    },
    {
      label: "This Year",
      value: { from: startOfYear(now), to: endOfYear(now) },
      description: "January to December"
    },
    {
      label: "Last Year",
      value: { from: startOfYear(subYears(now, 1)), to: endOfYear(subYears(now, 1)) },
      description: "Previous year"
    },
    {
      label: "Last 30 Days",
      value: { from: subDays(now, 30), to: now },
      description: "Rolling 30 days"
    },
    {
      label: "Last 90 Days",
      value: { from: subDays(now, 90), to: now },
      description: "Rolling 90 days"
    }
  ]
}

export function DateRangePicker({
  dateRange,
  setDateRange,
  className,
  placeholder = "Select date range",
  maxRange,
  minDate,
  maxDate = new Date(),
  showPresets = true,
  onError
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [manualInput, setManualInput] = React.useState(false)
  const [fromInput, setFromInput] = React.useState('')
  const [toInput, setToInput] = React.useState('')
  const isMobile = useIsMobile()

  const presets = getEnterprisePresets()

  const validateDateRange = (from: Date | undefined, to: Date | undefined): string | null => {
    if (!from || !to) return null

    if (!isValid(from) || !isValid(to)) {
      return "Invalid date format"
    }

    if (isAfter(from, to)) {
      return "Start date must be before end date"
    }

    if (minDate && isBefore(from, minDate)) {
      return `Date cannot be before ${format(minDate, 'MMM dd, yyyy')}`
    }

    if (maxDate && isAfter(to, maxDate)) {
      return `Date cannot be after ${format(maxDate, 'MMM dd, yyyy')}`
    }

    if (maxRange) {
      const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDiff > maxRange) {
        return `Date range cannot exceed ${maxRange} days`
      }
    }

    return null
  }

  const handleDateChange = (selected: any) => {
    const newRange = {
      from: selected?.from,
      to: selected?.to,
    }

    const validationError = validateDateRange(newRange.from, newRange.to)

    if (validationError) {
      setError(validationError)
      onError?.(validationError)
      return
    }

    setError(null)
    setDateRange(newRange)
  }

  const handlePresetClick = (preset: any) => {
    const validationError = validateDateRange(preset.value.from, preset.value.to)

    if (validationError) {
      setError(validationError)
      onError?.(validationError)
      return
    }

    setError(null)
    setDateRange(preset.value)
    setOpen(false)
  }

  const handleManualInput = () => {
    try {
      const fromDate = fromInput ? new Date(fromInput) : undefined
      const toDate = toInput ? new Date(toInput) : undefined

      const validationError = validateDateRange(fromDate, toDate)

      if (validationError) {
        setError(validationError)
        onError?.(validationError)
        return
      }

      setError(null)
      setDateRange({ from: fromDate, to: toDate })
      setManualInput(false)
    } catch (err) {
      setError("Invalid date format")
      onError?.("Invalid date format")
    }
  }

  const formatDisplayRange = (from: Date | undefined, to: Date | undefined) => {
    if (!from) return placeholder
    if (!to) return format(from, "MMM dd, yyyy")

    // Smart formatting for same month/year
    if (from.getFullYear() === to.getFullYear()) {
      if (from.getMonth() === to.getMonth()) {
        return `${format(from, "MMM dd")} - ${format(to, "dd, yyyy")}`
      }
      return `${format(from, "MMM dd")} - ${format(to, "MMM dd, yyyy")}`
    }

    return `${format(from, "MMM dd, yyyy")} - ${format(to, "MMM dd, yyyy")}`
  }

  React.useEffect(() => {
    if (dateRange.from) {
      setFromInput(format(dateRange.from, 'yyyy-MM-dd'))
    }
    if (dateRange.to) {
      setToInput(format(dateRange.to, 'yyyy-MM-dd'))
    }
  }, [dateRange])

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={error ? "destructive" : "outline"}
            className={cn(
              "w-full justify-start text-left font-normal relative",
              !dateRange.from && "text-muted-foreground",
              error && "border-red-500 text-red-700"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDisplayRange(dateRange.from, dateRange.to)}
            {error && <AlertCircle className="ml-auto h-4 w-4" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            {/* Presets Panel */}
            {showPresets && (
              <div className="border-b sm:border-b-0 sm:border-r p-3 sm:space-y-2 w-full sm:w-48 overflow-x-auto flex flex-row sm:flex-col gap-2 sm:gap-0">
                <div className="text-sm font-medium text-gray-900 hidden sm:block">Quick Select</div>

                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="sm"
                    className="w-auto sm:w-full justify-start text-xs h-auto py-1.5 shrink-0"
                    onClick={() => handlePresetClick(preset)}
                  >
                    <div>
                      <div className="font-medium whitespace-nowrap">{preset.label}</div>
                      <div className="text-xs text-gray-500 hidden sm:block">{preset.description}</div>
                    </div>
                  </Button>
                ))}

                <Separator className="hidden sm:block" />

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-auto sm:w-full justify-start text-xs shrink-0"
                  onClick={() => setManualInput(!manualInput)}
                >
                  {manualInput ? 'Use Calendar' : 'Manual Entry'}
                </Button>
              </div>
            )}

            {/* Calendar/Manual Input Panel */}
            <div className="p-3">
              {manualInput ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium">Enter Date Range</div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600">From</label>
                      <Input
                        type="date"
                        value={fromInput}
                        onChange={(e) => setFromInput(e.target.value)}
                        max={maxDate ? format(maxDate, 'yyyy-MM-dd') : undefined}
                        min={minDate ? format(minDate, 'yyyy-MM-dd') : undefined}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">To</label>
                      <Input
                        type="date"
                        value={toInput}
                        onChange={(e) => setToInput(e.target.value)}
                        max={maxDate ? format(maxDate, 'yyyy-MM-dd') : undefined}
                        min={minDate ? format(minDate, 'yyyy-MM-dd') : undefined}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleManualInput}>
                      <Check className="h-3 w-3 mr-1" />
                      Apply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setManualInput(false)}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{
                    from: dateRange.from,
                    to: dateRange.to,
                  }}
                  onSelect={handleDateChange}
                  numberOfMonths={isMobile ? 1 : 2}
                  disabled={(date) => {
                    if (minDate && isBefore(date, minDate)) return true
                    if (maxDate && isAfter(date, maxDate)) return true
                    return false
                  }}
                />
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="border-t p-3 bg-red-50">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          {/* Info Display */}
          {dateRange.from && dateRange.to && !error && (
            <div className="border-t p-3 bg-gray-50">
              <div className="text-xs text-gray-600">
                <Badge variant="secondary" className="mr-2">
                  {Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1} days
                </Badge>
                Selected range covers {formatDisplayRange(dateRange.from, dateRange.to)}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}