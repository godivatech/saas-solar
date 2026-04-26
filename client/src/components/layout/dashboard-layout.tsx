import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./sidebar";
import { MobileSidebar } from "./mobile-sidebar";
import { Header } from "./header";
import { NotificationBanner } from "./notification-banner";
import { useAuthContext } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, loading } = useAuthContext();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  // Close mobile menu when clicking outside of it
  useEffect(() => {
    const handleClickOutside = () => {
      if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    // Add event listener only when mobile menu is open
    if (isMobileMenuOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50">
      {/* Sidebar for desktop */}
      <Sidebar />

      {/* Mobile sidebar */}
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        setIsOpen={setIsMobileMenuOpen}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header with actions */}
        <Header onMenuClick={(e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent event bubbling
          setIsMobileMenuOpen(!isMobileMenuOpen);
        }} />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-3 py-4 pb-15 sm:p-4 md:p-6 bg-gray-50" style={{ overscrollBehavior: 'contain' }}>
          <div className="max-w-[1600px] mx-auto">
            {/* Notification banner for auto-checkout and admin alerts */}
            <div className="mb-4">
              <NotificationBanner />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
