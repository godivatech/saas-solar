// Smart incomplete records endpoint - department timing aware
// GET /api/attendance/incomplete
app.get("/api/attendance/incomplete", verifyAuth, requireAdmin, async (req, res) => {
    try {
        console.log('INCOMPLETE DETECTION: Fetching records with department timing awareness');

        // Get ALL attendance records without checkout (from all time periods)
        const allRecordsResponse = await storage.listAttendance();
        const recordsWithoutCheckout = allRecordsResponse.filter((record: any) =>
            record.checkInTime && !record.checkOutTime
        );

        console.log(`INCOMPLETE DETECTION: Found ${recordsWithoutCheckout.length} records without checkout`);

        // ✅ OPTIMIZATION: Fetch all department timings ONCE (avoid N+1 queries)
        const { EnterpriseTimeService } = await import('./services/enterprise-time-service');
        const allTimings = await EnterpriseTimeService.getAllDepartmentTimings();
        const timingMap = new Map(
            allTimings.map((t: any) => [t.departmentId || t.id, t])
        );

        console.log(`INCOMPLETE DETECTION: Loaded ${allTimings.length} department timings`);

        // Filter based on department timing
        const trulyIncomplete = [];

        for (const record of recordsWithoutCheckout) {
            // O(1) lookup from in-memory map - no database hit
            const timing = timingMap.get(record.userDepartment);

            if (!timing) {
                // No timing config found - include by default
                console.log(`INCOMPLETE DETECTION: No timing for dept ${record.userDepartment}, including record ${record.id}`);
                trulyIncomplete.push(record);
                continue;
            }

            // Check if checkout is actually overdue using time helpers
            const isOverdue = isCheckoutOverdue(
                new Date(record.date),
                timing.checkOutTime,
                30 // 30 min grace period
            );

            if (isOverdue) {
                trulyIncomplete.push(record);
            }
        }

        console.log(`INCOMPLETE DETECTION: ${trulyIncomplete.length} records are truly incomplete`);

        res.json(trulyIncomplete);
    } catch (error) {
        console.error("Error fetching incomplete records:", error);
        res.status(500).json({ message: "Failed to fetch incomplete records" });
    }
});

