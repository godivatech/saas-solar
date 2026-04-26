import { storage } from "../storage";

export class NotificationService {
    /**
     * Create an auto-checkout notification for a user
     */
    static async createAutoCheckoutNotification(userId: string, date: Date, checkoutTime: string) {
        const formattedDate = date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        return await storage.createNotification({
            userId,
            type: 'auto_checkout',
            category: 'attendance',
            title: 'Checkout Auto-Completed',
            message: `Your attendance for ${formattedDate} was automatically recorded at ${checkoutTime} as you did not check out.`,
            actionLabel: 'View Attendance',
            actionUrl: '/attendance',
            dismissible: true,
            status: 'unread',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        });
    }

    /**
     * Notify Admin about a pending review
     */
    static async notifyAdminReviewPending(recordId: string, employeeName: string, date: Date) {
        const admins = await storage.getUsersByRole('admin');
        const masterAdmins = await storage.getUsersByRole('master_admin');
        const allAdmins = [...admins, ...masterAdmins];

        const formattedDate = date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short'
        });

        const promises = allAdmins.map(admin =>
            storage.createNotification({
                userId: admin.uid,
                type: 'admin_review',
                category: 'attendance',
                title: 'Attendance Review Required',
                message: `${employeeName} has an auto-corrected attendance record for ${formattedDate} that needs your review.`,
                actionLabel: 'Review Now',
                actionUrl: `/admin/attendance?tab=pending-review&id=${recordId}`,
                dismissible: true,
                status: 'unread',
            })
        );

        await Promise.all(promises);
    }

    /**
     * Notify employee when admin adjusts their time
     */
    static async notifyAdjustmentMade(userId: string, date: Date, action: 'accepted' | 'adjusted' | 'rejected', notes?: string) {
        const formattedDate = date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short'
        });

        let title = '';
        let message = '';

        if (action === 'accepted') {
            title = 'Attendance Approved';
            message = `Your auto-checkout for ${formattedDate} has been approved by admin.`;
        } else if (action === 'adjusted') {
            title = 'Attendance Adjusted';
            message = `Your attendance for ${formattedDate} was adjusted by admin. ${notes ? `Note: ${notes}` : ''}`;
        } else {
            title = 'Attendance Rejected';
            message = `Your auto-checkout for ${formattedDate} was rejected. ${notes ? `Reason: ${notes}` : ''}`;
        }

        return await storage.createNotification({
            userId,
            type: 'system',
            category: 'attendance',
            title,
            message,
            dismissible: true,
            status: 'unread',
        });
    }

    /**
     * Notify employee when site visit is auto-closed
     */
    static async sendSiteVisitAutoCloseNotification(
        userId: string,
        customerName: string,
        visitStartTime: Date
    ) {
        const formattedDate = visitStartTime.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        return await storage.createNotification({
            userId,
            type: 'system',
            category: 'attendance',
            title: 'Site Visit Auto-Closed',
            message: `Your site visit to ${customerName} (${formattedDate}) was auto-closed because checkout was not completed within 24 hours. No action is required.`,
            actionLabel: 'View Site Visits',
            actionUrl: '/site-visits',
            dismissible: true,
            status: 'unread',
        });
    }
}

