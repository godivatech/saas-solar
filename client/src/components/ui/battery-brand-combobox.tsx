import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { batteryBrands, batteryBrandDisplayNames } from "@shared/schema";

interface BatteryBrandComboboxProps {
    value: string | undefined;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Reusable autocomplete combobox for battery brand selection
 * Allows both selection from predefined brands and custom brand entry
 * Optimized for mobile with larger touch targets and full-width dropdown
 */
export function BatteryBrandCombobox({
    value,
    onValueChange,
    placeholder = "Select or type battery brand...",
    disabled = false,
    className
}: BatteryBrandComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    // Get display name for a brand value
    const getDisplayName = (brand: string): string => {
        if (!brand) return "";
        // Check if it's a known brand
        if (brand in batteryBrandDisplayNames) {
            return batteryBrandDisplayNames[brand];
        }
        // For custom brands, capitalize first letter of each word
        return brand
            .split(/[_\s]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    };

    // Current display value
    const displayValue = value ? getDisplayName(value) : placeholder;

    // Build suggestions list: custom first (if typing), then predefined
    const suggestions = React.useMemo(() => {
        const predefined = (batteryBrands as readonly string[]).map(brand => ({
            value: brand,
            label: batteryBrandDisplayNames[brand],
            isPredefined: true
        }));

        const result: typeof predefined = [];

        // Add custom option FIRST if search has value and doesn't match predefined
        if (search && !batteryBrands.some(b => batteryBrandDisplayNames[b].toLowerCase() === search.toLowerCase())) {
            result.push({
                value: search.toLowerCase().replace(/\s+/g, "_"),
                label: search,
                isPredefined: false
            });
        }

        // Then add predefined options
        result.push(...predefined);

        return result;
    }, [search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between h-10 sm:h-9", // Larger on mobile
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate text-left flex-1">{displayValue}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
                sideOffset={4}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search or type a brand..."
                        value={search}
                        onValueChange={setSearch}
                        className="h-10 sm:h-9" // Larger on mobile
                    />
                    <CommandList className="max-h-[60vh] sm:max-h-[300px]"> {/* Better mobile height */}
                        <CommandEmpty>
                            <div className="p-3 sm:p-2 text-sm">
                                {search ? (
                                    <button
                                        type="button"
                                        className="w-full text-left px-3 py-2.5 sm:px-2 sm:py-1.5 hover:bg-accent rounded-sm transition-colors"
                                        onClick={() => {
                                            const customValue = search.toLowerCase().replace(/\s+/g, "_");
                                            onValueChange(customValue);
                                            setOpen(false);
                                            setSearch("");
                                        }}
                                    >
                                        Use custom: <span className="font-medium">{search}</span>
                                    </button>
                                ) : (
                                    <span className="text-muted-foreground">Type to add custom brand</span>
                                )}
                            </div>
                        </CommandEmpty>
                        <CommandGroup>
                            {suggestions.map((suggestion) => (
                                <CommandItem
                                    key={suggestion.value}
                                    value={suggestion.label}
                                    onSelect={() => {
                                        onValueChange(suggestion.value);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                    className="px-3 py-2.5 sm:px-2 sm:py-1.5" // Larger touch targets on mobile
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            value === suggestion.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="flex-1">{suggestion.label}</span>
                                    {!suggestion.isPredefined && (
                                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">(Custom)</span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
