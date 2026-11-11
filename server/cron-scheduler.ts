import * as cron from 'node-cron';
import { AutoCheckoutService } from './services/auto-checkout-service';
import { OTAutoCloseService } from './services/ot-auto-close-cron';
import { SiteVisitAutoCloseService } from './services/site-visit-auto-close-service';
import { LeaveBalanceService } from './services/leave-balance-service';
import { getISTDateString } from './utils/timezone-helpers';

/**
 * Initialize all scheduled cron jobs
 * Called once when the server starts
 */
export function initializeCronJobs() {
    console.log('[CRON] Initializing automated cron jobs...');

    // Auto-Checkout Job: Runs every 5 minutes
    // Cron expression: "*/5 * * * *" = Every 5 minutes
    const autoCheckoutJob = cron.schedule('*/5 * * * *', async () => {
        console.log('[CRON] Auto-checkout job triggered at:', new Date().toISOString());
        try {
            await AutoCheckoutService.processAutoCheckouts();
            console.log('[CRON] Auto-checkout job completed successfully');
        } catch (error) {
            console.error('[CRON] Error in auto-checkout job:', error);
        }
    }, {
        timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('[CRON] ✅ Auto-checkout job scheduled: Every 5 minutes');

    // OT Auto-Close Job: Runs every hour (at minute 5)
    // Cron expression: "5 * * * *" = At minute 5 of every hour
    const otAutoCloseJob = cron.schedule('5 * * * *', async () => {
        console.log('[CRON] OT auto-close job triggered at:', new Date().toISOString());
        try {
            await OTAutoCloseService.runNow();
            console.log('[CRON] OT auto-close job completed successfully');
        } catch (error) {
            console.error('[CRON] Error in OT auto-close job:', error);
        }
    }, {
        timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('[CRON] ✅ OT auto-close job scheduled: Every hour (at minute 5)');

    // Site Visit Auto-Close Job: Runs daily at midnight (12:05 AM)
    // Cron expression: "5 0 * * *" = At 12:05 AM every day
    const siteVisitAutoCloseJob = cron.schedule('5 0 * * *', async () => {
        console.log('[CRON] Site visit auto-close job triggered at:', new Date().toISOString());
        try {
            await SiteVisitAutoCloseService.processAutoClose();
            console.log('[CRON] Site visit auto-close job completed successfully');
        } catch (error) {
            console.error('[CRON] Error in site visit auto-close job:', error);
        }
    }, {
        timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('[CRON] ✅ Site visit auto-close job scheduled: Daily at 12:05 AM');

    // Monthly Leave Balance Reset Job: Runs on 1st of every month at 12:10 AM IST
    // Cron expression: "10 0 1 * *" = At 12:10 AM on day 1 of every month
    const monthlyLeaveResetJob = cron.schedule('10 0 1 * *', async () => {
        console.log('[CRON] Monthly leave reset job triggered at:', new Date().toISOString());
        try {
            await LeaveBalanceService.processMonthlyResetAllTenants();
            console.log('[CRON] Monthly leave reset job completed successfully');
        } catch (error) {
            console.error('[CRON] Error in monthly leave reset job:', error);
        }
    }, {
        timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('[CRON] ✅ Monthly leave reset job scheduled: 1st of every month at 12:10 AM');

    // ✅ RELIABILITY FIX: Run auto-checkout catch-up check on server startup
    // This catches up on any forgotten checkouts if the server was down or restarted
    console.log('[CRON] Running auto-checkout startup check...');
    AutoCheckoutService.processAutoCheckouts()
        .then(() => console.log('[CRON] ✅ Startup auto-checkout check completed'))
        .catch(error => console.error('[CRON] ⚠️ Startup auto-checkout check failed:', error));

    // ✅ RELIABILITY FIX: Run OT auto-close on server startup
    // This catches up on any forgotten sessions if the laptop/server was off
    console.log('[CRON] Running OT auto-close startup check...');
    OTAutoCloseService.runNow()
        .then(() => console.log('[CRON] ✅ Startup OT check completed - any forgotten sessions have been processed'))
        .catch(error => console.error('[CRON] ⚠️ Startup OT check failed:', error));

    // ✅ RELIABILITY FIX: Run Site Visit auto-close on server startup
    // This catches up on any forgotten site visits (> 24 hours) if the server was restarted
    console.log('[CRON] Running Site Visit auto-close startup check...');
    SiteVisitAutoCloseService.processAutoClose()
        .then(() => console.log('[CRON] ✅ Startup Site Visit check completed'))
        .catch(error => console.error('[CRON] ⚠️ Startup Site Visit check failed:', error));

    // ✅ RELIABILITY FIX: Catch-up check for monthly leave reset on server startup (IST-safe)
    const [, , startupDay] = getISTDateString(new Date()).split('-').map(Number);
    if (startupDay === 1) {
        console.log('[CRON] 1st of the month detected on startup - running monthly leave reset check...');
        LeaveBalanceService.processMonthlyResetAllTenants()
            .then(() => console.log('[CRON] ✅ Startup monthly leave reset check completed'))
            .catch(error => console.error('[CRON] ⚠️ Startup monthly leave reset check failed:', error));
    }

    return {
        autoCheckoutJob,
        otAutoCloseJob,
        siteVisitAutoCloseJob,
        monthlyLeaveResetJob
    };
}

/**
 * Stop all cron jobs (for graceful shutdown)
 */
export function stopCronJobs(jobs: {
    autoCheckoutJob: cron.ScheduledTask;
    otAutoCloseJob: cron.ScheduledTask;
    siteVisitAutoCloseJob: cron.ScheduledTask;
    monthlyLeaveResetJob?: cron.ScheduledTask;
}) {
    console.log('[CRON] Stopping all cron jobs...');
    jobs.autoCheckoutJob.stop();
    jobs.otAutoCloseJob.stop();
    jobs.siteVisitAutoCloseJob.stop();
    jobs.monthlyLeaveResetJob?.stop();
    console.log('[CRON] All cron jobs stopped');
}
