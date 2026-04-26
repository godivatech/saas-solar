
import { db } from "./firebase";
import { enterpriseTimeService } from "./services/enterprise-time-service";

async function verifySettings() {
    console.log("Checking department timings in Firestore...");
    const snapshot = await db.collection("department_timings").get();

    if (snapshot.empty) {
        console.log("No department timings found.");
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Department: ${doc.id}`);
        console.log(`- Auto-Checkout Grace: ${data.autoCheckoutGraceMinutes} minutes`);
        console.log(`- Late Threshold: ${data.lateThresholdMinutes} minutes`);
        console.log(`- OT Threshold: ${data.overtimeThresholdMinutes} minutes`);
        console.log("---");
    });

    // Also check through the service
    const technicalTiming = await enterpriseTimeService.getDepartmentTiming("technical");
    console.log("\nService Level Check (Technical Department):");
    console.log(`- Auto-Checkout Grace: ${technicalTiming.autoCheckoutGraceMinutes} minutes`);
}

verifySettings().catch(console.error);
