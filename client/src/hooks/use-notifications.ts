import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Notification {
    id: string;
    userId: string;
    type: "auto_checkout" | "admin_review" | "site_visit_auto_closed" | "system" | "general";
    category: "attendance" | "leave" | "ot" | "general";
    title: string;
    message: string;
    actionUrl?: string | null;
    actionLabel?: string | null;
    dismissible: boolean;
    status: "unread" | "read";
    dismissedAt?: Date | null;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export function useNotifications() {
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery<{ success: boolean; notifications: Notification[] }>({
        queryKey: ["/api/notifications"],
        refetchInterval: 30000, // Refetch every 30 seconds
        staleTime: 0, // Always consider stale to ensure fresh data
    });

    const dismissMutation = useMutation({
        mutationFn: async (notificationId: string) => {
            const res = await apiRequest(`/api/notifications/${notificationId}/dismiss`, "POST");
            return res.json();
        },
        onSuccess: () => {
            // Invalidate and refetch notifications
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        },
    });

    return {
        notifications: data?.notifications || [],
        isLoading,
        error,
        dismissNotification: dismissMutation.mutate,
        isDismissing: dismissMutation.isPending,
    };
}
