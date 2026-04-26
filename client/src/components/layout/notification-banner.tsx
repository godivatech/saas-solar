import { AlertCircle, CheckCircle, Info, X, Clock, MapPin } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

const notificationIcons = {
    auto_checkout: Clock,
    admin_review: AlertCircle,
    site_visit_auto_closed: MapPin,
    system: Info,
    general: Info,
};

const notificationColors = {
    auto_checkout: "bg-amber-50 border-amber-300 text-amber-900",
    admin_review: "bg-blue-50 border-blue-300 text-blue-900",
    site_visit_auto_closed: "bg-teal-50 border-teal-300 text-teal-900",
    system: "bg-gray-50 border-gray-300 text-gray-900",
    general: "bg-gray-50 border-gray-300 text-gray-900",
};

const notificationIconColors = {
    auto_checkout: "text-amber-600",
    admin_review: "text-blue-600",
    site_visit_auto_closed: "text-teal-600",
    system: "text-gray-600",
    general: "text-gray-600",
};

export function NotificationBanner() {
    const { notifications, dismissNotification, isDismissing } = useNotifications();

    // Only show unread notifications
    const unreadNotifications = notifications.filter(n => n.status === "unread");

    if (unreadNotifications.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            {unreadNotifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Info;

                return (
                    <Alert
                        key={notification.id}
                        className={cn(
                            "relative pr-12",
                            notificationColors[notification.type]
                        )}
                    >
                        <Icon className={cn("h-5 w-5", notificationIconColors[notification.type])} />
                        <AlertTitle className="font-semibold mb-1">
                            {notification.title}
                        </AlertTitle>
                        <AlertDescription className="text-sm">
                            {notification.message}
                            {notification.actionUrl && notification.actionLabel && (
                                <a
                                    href={notification.actionUrl}
                                    className="ml-2 underline font-medium hover:no-underline"
                                >
                                    {notification.actionLabel}
                                </a>
                            )}
                        </AlertDescription>

                        {notification.dismissible && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 rounded-full hover:bg-black/5"
                                onClick={() => dismissNotification(notification.id)}
                                disabled={isDismissing}
                                aria-label="Dismiss notification"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </Alert>
                );
            })}
        </div>
    );
}
