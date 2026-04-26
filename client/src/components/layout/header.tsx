import { useState } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { PlusCircle, Bell, Menu, FileText, Clock, Calendar, Zap } from "lucide-react";
import { useAuthContext } from "@/contexts/auth-context";

interface HeaderProps {
  onMenuClick: (e: React.MouseEvent) => void;
}

interface MenuEntryOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [location] = useLocation();
  const { user } = useAuthContext();

  // Map of routes to display names
  const routeTitles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/customers": "Customers",
    "/quotations": "Quotations",
    "/invoices": "Invoices",
    "/attendance": "Attendance",
    "/leave": "Leave Management",
    "/user-management": "User Management",
    "/departments": "Departments",
    "/settings": "Settings",
    "/employee-ot": "Overtime",
  };

  // Determine the current page title
  const pageTitle = routeTitles[location] || "Dashboard";

  // New entry options based on current page
  const getNewEntryOptions = (): MenuEntryOption[] => {
    const commonOptions = [
      { label: "New Quotation", description: "Create a quotation", icon: <FileText className="h-4 w-4" />, href: "/quotations/new" },
      { label: "Attendance", description: "All Attendance", icon: <Clock className="h-4 w-4" />, href: "/attendance" },
      { label: "OT", description: "All Overtime", icon: <Zap className="h-4 w-4" />, href: "/employee-ot" }
    ];

    switch (location) {
      case "/quotations":
        return commonOptions;
      case "/attendance":
        return commonOptions;
      case "/leave":
        return [
          { label: "Apply Leave", description: "Request leave", icon: <Calendar className="h-4 w-4" />, href: "/leave/new" },
          ...commonOptions
        ];
      default:
        return commonOptions;
    }
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile menu button - visible only on mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 rounded-full"
              onClick={onMenuClick}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </Button>

            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate max-w-[180px] sm:max-w-[250px] md:max-w-none">{pageTitle}</h1>
              <p className="text-xs md:text-sm text-gray-500 truncate max-w-[180px] sm:max-w-[250px] md:max-w-none">
                Welcome back, {user?.displayName || user?.email || 'User'}!
                {user?.department && (
                  <span className="ml-2 text-primary font-medium">
                    • {user.department.charAt(0).toUpperCase() + user.department.slice(1)} Dept.
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white h-9 px-2 md:px-4 rounded-md">
                  <PlusCircle className="md:mr-2 h-4 w-4" />
                  <span className="hidden md:inline">New Entry</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-sm font-semibold px-2 py-2">Create New</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {getNewEntryOptions().map((option, index) => (
                  <DropdownMenuItem
                    key={index}
                    className="cursor-pointer px-3 py-3 hover:bg-gray-100 focus:bg-gray-100 focus:text-gray-900 flex items-start gap-3"
                    onClick={() => {
                      if ('onClick' in option && option.onClick) {
                        option.onClick();
                      } else if ('href' in option && option.href) {
                        window.location.href = option.href;
                      }
                    }}
                  >
                    <div className="text-primary mt-0.5">{option.icon}</div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">{option.label}</span>
                      <span className="text-xs text-gray-500">{option.description}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* <div className="relative">
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
                <Bell className="h-5 w-5 text-gray-600" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full"></span>
              </Button>
            </div> */}
          </div>
        </div>
      </header>
    </>
  );
}
