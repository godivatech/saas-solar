
import "dotenv/config";
import { storage } from "../server/storage";
import { userService } from "../server/services/user-service";

async function verifyFix() {
    console.log("Starting verification of Double Data Loss Fix...");

    const testUid = `test-verify-${Date.now()}`;
    const testEmail = `verify.${Date.now()}@example.com`;

    try {
        // 1. Create a raw user directly in DB (safest to avoid schema validation noise in script)
        // We can't use storage.createUser easily without mocking zParse or matching schema perfectly.
        // Instead we will mock the "creation" by direct Firestore insert if possible, 
        // OR just use storage calls if we match schema.

        // Let's try storage.createUser with minimal valid data
        const userData = {
            uid: testUid,
            email: testEmail,
            displayName: "Verification User",
            role: "employee",
            department: "marketing",
            designation: "executive",
            employeeStatus: "active",
            username: testUid, // needed for auth schema sometimes
            password: "password123",
            isActive: true,
            createdAt: new Date(), // storage might overwrite
        };

        // Assuming we can skip schema validation here for simplicity? 
        // No, storage.createUser parses schema. 
        // Let's try to just use storage.db directly if exposed, or try to pass schema.

        // Actually, let's just use the createUser method.
        // Use 'any' to bypass strict TS in this script file.
        await storage.createUser(userData as any);
        console.log(`1. Created test user: ${testUid}`);

        // 2. Delete the user via Service (this triggers the soft delete logic)
        console.log("2. Deleting user via userService...");
        await userService.deleteUser(testUid);

        // 3. Verify Layer 1: Storage
        console.log("3. Verifying Storage Layer (listUsers)...");
        const storageUsers = await storage.listUsers();
        const storageUser = storageUsers.find(u => u.uid === testUid);

        if (!storageUser) {
            throw new Error("User vanished from storage! Soft delete failed?");
        }

        console.log(`   - Storage employeeStatus: '${storageUser.employeeStatus}'`);
        if (storageUser.employeeStatus !== 'terminated') {
            console.error("❌ FAILED: Storage layer is NOT returning 'terminated' status. Did you fix storage.ts?");
            process.exit(1);
        } else {
            console.log("✅ PASSED: Storage layer returns 'terminated'.");
        }

        // 4. Verify Layer 2: Service
        console.log("4. Verifying Service Layer (getAllUsers)...");
        const serviceResult = await userService.getAllUsers();

        // Handle both return types just in case (User[] vs {users: User[]})
        let serviceUsers: any[] = [];
        if (Array.isArray(serviceResult)) {
            serviceUsers = serviceResult;
        } else if (serviceResult.success && serviceResult.users) {
            serviceUsers = serviceResult.users;
        }

        const serviceUser = serviceUsers.find(u => u.uid === testUid);

        if (!serviceUser) {
            throw new Error("User vanished from Service layer!");
        }

        // Check isActive
        console.log(`   - Service isActive: ${serviceUser.isActive}`);
        console.log(`   - Service employeeStatus: '${serviceUser.employeeStatus}'`);

        const isActiveCorrect = serviceUser.isActive === false;
        const isStatusCorrect = serviceUser.employeeStatus === 'terminated';

        if (isActiveCorrect && isStatusCorrect) {
            console.log("✅ PASSED: Service layer returns correct flags.");
        } else {
            console.error(`❌ FAILED: Service flags incorrect. isActive: ${serviceUser.isActive}, status: ${serviceUser.employeeStatus}`);
            process.exit(1);
        }

        console.log("\n🎉 ALL CHECKS PASSED. Fix is verified.");

    } catch (error) {
        console.error("Test failed with error:", error);
        process.exit(1);
    } finally {
        // Cleanup if possible? Database might be persistent.
        // It's a test user, acceptable to leave or try to hard delete.
        // For now, leave it.
        process.exit(0);
    }
}

verifyFix();
