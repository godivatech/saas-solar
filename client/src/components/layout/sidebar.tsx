import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/contexts/auth-context";
import { ChevronDown, LogOut, Briefcase, Users, Shield, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";


import type { SystemPermission } from "@shared/schema";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  requiredPermissions?: SystemPermission | SystemPermission[];
  roles?: ("master_admin" | "admin" | "employee")[];
  requiresApproval?: boolean;
}

interface NavGroup {
  category: string;
  items: NavItem[];
}

export function Sidebar() {
  const [location] = useLocation();
  const { user, hasPermission, hasRole, canApprove } = useAuthContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMd, setIsMd] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Business": true,
    "My Workspace": true,
    "HR & Operations": true,
    "System": true
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Remove legacy permission hook - now using enterprise RBAC

  // Handle responsive window resizing
  useEffect(() => {
    const handleResize = () => {
      setIsMd(window.innerWidth >= 768);
    };

    // Set initial state
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleGroup = (category: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const isExpanding = !expandedGroups[category];

    setExpandedGroups(prev => ({
      ...prev,
      [category]: !prev[category]
    }));

    // Smart scroll: only when expanding and content might be off-screen
    if (isExpanding && scrollContainerRef.current) {
      const button = event.currentTarget;
      const container = scrollContainerRef.current;

      // Wait for expansion animation to start
      setTimeout(() => {
        const buttonRect = button.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate if expanded content would be below viewport
        const buttonBottom = buttonRect.bottom;
        const containerBottom = containerRect.bottom;
        const estimatedContentHeight = 200; // Approximate height of expanded group

        // If content would overflow, scroll to keep it visible
        if (buttonBottom + estimatedContentHeight > containerBottom) {
          const scrollAmount = (buttonBottom + estimatedContentHeight) - containerBottom + 20; // 20px padding

          container.scrollTo({
            top: container.scrollTop + scrollAmount,
            behavior: 'smooth'
          });
        }
      }, 50);
    }
  };

  // Category icons mapping
  const categoryIcons: Record<string, React.ReactNode> = {
    "Business": <Briefcase className="h-3.5 w-3.5" />,
    "My Workspace": <Users className="h-3.5 w-3.5" />,
    "HR & Operations": <Shield className="h-3.5 w-3.5" />,
    "System": <SettingsIcon className="h-3.5 w-3.5" />
  };

  // Check if category contains the active page
  const isCategoryActive = (group: NavGroup) => {
    return group.items.some(item => item.href === location);
  };

  // Define navigation items grouped by category with enterprise RBAC permissions
  const navGroups: NavGroup[] = [
    {
      category: "Business",
      items: [
        {
          href: "/dashboard",
          label: "Dashboard",
          icon: <i className="ri-dashboard-line mr-3 text-xl"></i>,
          requiredPermissions: "dashboard.view"
        },
        {
          href: "/customers",
          label: "Customers",
          icon: <i className="ri-user-3-line mr-3 text-xl"></i>,
          requiredPermissions: ["customers.view", "customers.create"]
        },
        {
          href: "/quotations",
          label: "Quotations",
          icon: <i className="ri-file-list-3-line mr-3 text-xl"></i>,
          requiredPermissions: ["quotations.view", "quotations.create"]
        },
      ]
    },
    {
      // Renamed from "Workforce" to "My Workspace" - focused on employee self-service
      category: "My Workspace",
      items: [
        {
          href: "/attendance",
          label: "My Attendance",
          icon: <i className="ri-time-line mr-3 text-xl"></i>,
          requiredPermissions: ["attendance.view_own", "attendance.view_team", "attendance.view_all"]
        },
        {
          href: "/employee-ot",
          label: "My Overtime",
          icon: <i className="ri-timer-flash-line mr-3 text-xl"></i>,
          requiredPermissions: "attendance.view_own"
        },
        {
          href: "/leave",
          label: "Apply Leave",
          icon: <i className="ri-calendar-check-line mr-3 text-xl"></i>,
          requiredPermissions: ["leave.view_own", "leave.view_team", "leave.view_all"]
        },
        {
          href: "/site-visit",
          label: "Site Visit Check-in",
          icon: <i className="ri-map-pin-line mr-3 text-xl"></i>,
          requiredPermissions: ["site_visit.view", "site_visit.create"]
        },
      ]
    },
    {
      // Renamed from "Administration" to "HR & Operations" - focused on management
      category: "HR & Operations",
      items: [
        {
          href: "/hr-management",
          label: "Employee Management",
          icon: <i className="ri-team-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"],
          requiredPermissions: ["users.view"]
        },
        {
          href: "/departments",
          label: "Departments",
          icon: <i className="ri-building-line mr-3 text-xl"></i>,
          roles: ["master_admin"],
          requiredPermissions: ["departments.view", "departments.create"]
        },
        {
          href: "/attendance-management",
          label: "Attendance Management",
          icon: <i className="ri-shield-user-line mr-3 text-xl"></i>,
          roles: ["master_admin"]
        },
        {
          href: "/ot-administration",
          label: "Attendance & OT",
          icon: <i className="ri-settings-3-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"]
        },
        {
          href: "/site-visit-monitoring",
          label: "Site Visit Monitoring",
          icon: <i className="ri-dashboard-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"],
          requiredPermissions: ["site_visit.view_all", "site_visit.reports"]
        },
        {
          href: "/payroll-management",
          label: "Payroll Management",
          icon: <i className="ri-money-dollar-circle-line mr-3 text-xl"></i>,
          roles: ["master_admin"]
        },
      ]
    },
    {
      category: "Reports",
      items: [
        {
          href: "/attendance-reports",
          label: "Attendance Reports",
          icon: <i className="ri-file-chart-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"]
        },
        {
          href: "/ot-reports",
          label: "OT Reports",
          icon: <i className="ri-file-chart-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"]
        },
        {
          href: "/leave-reports",
          label: "Leave Reports",
          icon: <i className="ri-file-list-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"]
        },
      ]
    },
    {
      category: "System",
      items: [
        {
          href: "/user-management",
          label: "User Management",
          icon: <i className="ri-user-settings-line mr-3 text-xl"></i>,
          roles: ["master_admin", "admin"],
          requiredPermissions: ["users.view", "users.create"]
        },
        {
          href: "/settings",
          label: "Settings",
          icon: <i className="ri-settings-4-line mr-3 text-xl"></i>
        },
      ]
    }
  ];

  // Filter items and groups based on enterprise RBAC permissions
  const filterItem = (item: NavItem) => {
    // Always show items with no restrictions
    if (!item.roles && !item.requiredPermissions && !item.requiresApproval) return true;

    // If no user, don't show restricted items
    if (!user) return false;

    // Check role-based access if specified
    if (item.roles && !hasRole(item.roles)) return false;

    // Check enterprise permissions
    if (item.requiredPermissions && !hasPermission(item.requiredPermissions)) return false;

    // Check approval permissions if required
    if (item.requiresApproval && !canApprove) return false;

    return true;
  };

  const filteredNavGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(filterItem)
    }))
    .filter(group => group.items.length > 0);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col bg-white border-r border-gray-200 h-full transition-all duration-300 ease-in-out",
        isCollapsed ? "md:w-[70px] lg:w-20" : "md:w-56 lg:w-64",
      )}
    >
      <div className="py-3 px-3 md:p-4 border-b border-gray-200 flex items-center justify-between">
        <div className={cn(
          "flex items-center gap-2",
          isCollapsed ? "justify-center w-full" : "justify-center w-full"
        )}>
          <div className={cn("font-bold text-primary", isCollapsed ? "text-sm" : "text-xl")}>
            Godiva Solar
          </div>
        </div>
        {isMd && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`${isCollapsed ? 'ri-menu-unfold-line' : 'ri-menu-fold-line'} text-lg`}></i>
          </button>
        )}
      </div>

      <div ref={scrollContainerRef} className="overflow-y-auto flex-grow p-1 md:p-2">
        <nav className={cn("space-y-3 md:space-y-4", isCollapsed && "space-y-2")}>
          {filteredNavGroups.map((group, groupIndex) => {
            const isActive = isCategoryActive(group);

            return (
              <div key={groupIndex}>
                {/* Visual separator between categories */}
                {groupIndex > 0 && !isCollapsed && (
                  <div className="h-px bg-gray-200 my-3 md:my-4" />
                )}

                {!isCollapsed ? (
                  <button
                    onClick={(e) => toggleGroup(group.category, e)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 md:px-4 py-2 mb-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 rounded-md group",
                      isActive
                        ? "text-primary bg-primary/5 hover:bg-primary/10"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    )}
                    data-testid={`toggle-${group.category.toLowerCase()}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "transition-colors",
                        isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                      )}>
                        {categoryIcons[group.category]}
                      </span>
                      <span>{group.category}</span>
                    </div>
                    <ChevronDown className={cn(
                      "h-4 w-4 transition-transform duration-300 ease-in-out",
                      expandedGroups[group.category] && "rotate-180"
                    )} />
                  </button>
                ) : null}
                <div className={cn(
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isCollapsed && "flex flex-col items-center",
                  !isCollapsed && expandedGroups[group.category] ? "max-h-[2000px] opacity-100" : !isCollapsed ? "max-h-0 opacity-0" : ""
                )}>
                  <div className={cn("space-y-0.5 md:space-y-1", isCollapsed && "flex flex-col items-center")}>
                    {group.items.map((item, itemIndex) => (
                      <Link
                        key={itemIndex}
                        href={item.href}
                        className={cn(
                          "sidebar-item flex items-center px-3 py-2.5 md:px-4 md:py-3 rounded-md hover:bg-gray-100 text-gray-700 transition-colors duration-200",
                          isCollapsed && "justify-center px-2",
                          location === item.href && "active bg-primary/10",
                          !isCollapsed && location === item.href && "border-l-4 border-primary"
                        )}
                        title={isCollapsed ? item.label : undefined}
                        data-testid={`nav-${item.href.substring(1)}`}
                      >
                        <div className={isCollapsed ? "mx-auto" : ""}>{item.icon}</div>
                        {!isCollapsed && <span className="text-sm md:text-base truncate">{item.label}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className={cn(
        "p-3 md:p-4 border-t border-gray-200",
        isCollapsed && "flex justify-center"
      )}>
        {!isCollapsed ? (
          <div className="flex items-center">
            <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="h-9 w-9 md:h-10 md:w-10 rounded-full object-cover"
                />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-gray-500"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div className="ml-2 md:ml-3 min-w-0">
              <p className="font-medium text-xs md:text-sm truncate max-w-[80px] md:max-w-[100px] lg:max-w-none">
                {user?.displayName || "User"}
              </p>
              <p className="text-xs text-gray-500 truncate max-w-[80px] md:max-w-[100px] lg:max-w-none">
                {user?.role === "master_admin" ? "Master Admin" : user?.role === "admin" ? "Admin" : "Employee"}
              </p>
            </div>
            <button
              onClick={() => {
                import("@/lib/firebase").then(({ logoutUser }) => {
                  logoutUser().then(() => {
                    window.location.href = "/login";
                  });
                });
              }}
              className="ml-auto text-gray-500 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50/50"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              import("@/lib/firebase").then(({ logoutUser }) => {
                logoutUser().then(() => {
                  window.location.href = "/login";
                });
              });
            }}
            className="text-gray-500 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50/50"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="py-2 text-center border-t border-gray-100 bg-gray-50/50">
          <a
            href="https://godivatech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-400 hover:text-primary transition-colors font-medium"
          >
            Developed by Godivatech
          </a>
        </div>
      )
      }
    </aside >
  );
}
