// PUT /api/holidays/:id - Update a holiday
app.put("/api/holidays/:id", verifyAuth, async (req, res) => {
    try {
        const user = await storage.getUser(req.authenticatedUser?.uid || "");
        if (!user || !(await storage.checkEffectiveUserPermission(user.uid, "system.settings"))) {
            return res.status(403).json({ success: false, message: "Access denied - System settings permission required" });
        }

        console.log("[Holiday Update] Request body:", JSON.stringify(req.body, null, 2));

        // Transform frontend data to match schema
        const { date, name, type, applicableDepartments, notes } = req.body;

        if (!date || !name) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: date and name are required"
            });
        }

        const holidayDate = new Date(date);
        const year = holidayDate.getFullYear();

        const updateData = {
            name,
            date: holidayDate,
            year,
            type: type || "national",
            isPaid: true,
            isOptional: false,
            applicableDepartments: applicableDepartments || null,
            description: notes || null,
        };

        console.log("[Holiday Update] Transformed data:", JSON.stringify(updateData, null, 2));

        const holiday = await storage.updateFixedHoliday(req.params.id, updateData);
        res.json({ success: true, holiday, message: "Holiday updated successfully" });
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error("[Holiday Update] Validation error:", JSON.stringify(error.errors, null, 2));
            return res.status(400).json({ success: false, errors: error.errors, message: "Validation failed" });
        }
        console.error("[Holiday Update] Error:", error);
        res.status(500).json({ success: false, message: "Failed to update holiday" });
    }
});
