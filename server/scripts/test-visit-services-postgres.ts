import 'dotenv/config';
import { siteVisitService } from '../services/site-visit-service';
import { followUpService } from '../services/follow-up-service';

async function testSiteVisitAndFollowUpServices() {
  console.log("=== Testing PostgreSQL SiteVisit & FollowUp Services ===");

  const testUserId = `test-engineer-${Date.now()}`;
  let siteVisitId = '';
  let followUpId = '';

  try {
    // 1. Create a site visit
    console.log("1. Creating site visit in PostgreSQL...");
    const createdVisit = await siteVisitService.createSiteVisit({
      userId: testUserId,
      department: 'technical',
      visitPurpose: 'feasibility_check',
      status: 'in_progress',
      siteInTime: new Date(),
      customer: {
        name: "Test Solar Customer",
        mobile: "9876543210",
        phone: "9876543210",
        address: "123 Solar Street, Bangalore",
        city: "Bangalore",
        state: "Karnataka",
        pincode: "560001",
        email: "testsolar@example.com",
        propertyType: "residential",
        source: "direct"
      },
      technicalData: {
        propertyType: "residential",
        technicalWorkType: "feasibility_check",
        onGridConfig: {
          panelWatts: 550,
          inverterKW: 5
        }
      } as any,
      notes: "Initial site inspection"
    });

    siteVisitId = createdVisit.id;
    console.log(`✅ Site visit created successfully with ID: ${siteVisitId}`);

    // 2. Fetch by ID
    console.log("2. Fetching site visit by ID...");
    const fetchedVisit = await siteVisitService.getSiteVisitById(siteVisitId);
    if (!fetchedVisit || fetchedVisit.id !== siteVisitId) {
      throw new Error(`Failed to fetch visit by ID: expected ${siteVisitId}, got ${fetchedVisit?.id}`);
    }
    console.log(`✅ Fetched visit verified: department=${fetchedVisit.department}, customer=${fetchedVisit.customer.name}`);

    // 3. Test filtering
    console.log("3. Testing site visit filter query...");
    const filtered = await siteVisitService.getSiteVisitsWithFilters({
      userId: testUserId,
      department: 'technical',
      status: 'in_progress'
    });
    if (filtered.length === 0 || filtered[0].id !== siteVisitId) {
      throw new Error(`Filter did not return created visit`);
    }
    console.log(`✅ Filter query verified: found ${filtered.length} matching visits`);

    // 4. Test adding photos
    console.log("4. Testing adding site photos...");
    const updatedWithPhotos = await siteVisitService.addSitePhotos(siteVisitId, [
      {
        url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        caption: "Rooftop view",
        timestamp: new Date()
      }
    ]);
    if (updatedWithPhotos.sitePhotos.length === 0) {
      throw new Error("Photos not added");
    }
    console.log(`✅ Photos verified: ${updatedWithPhotos.sitePhotos.length} photo(s) stored`);

    // 5. Test Quick Update
    console.log("5. Testing quick update outcome (reschedule)...");
    const rescheduled = await siteVisitService.quickUpdateSiteVisit(siteVisitId, 'reschedule', {
      userId: testUserId,
      scheduledFollowUpDate: new Date(Date.now() + 86400000),
      reason: "Client requested follow-up tomorrow"
    });
    if (rescheduled.customerCurrentStatus !== 'on_process') {
      throw new Error(`Expected on_process status, got ${rescheduled.customerCurrentStatus}`);
    }
    console.log(`✅ Quick update verified: outcome=${rescheduled.visitOutcome}, status=${rescheduled.customerCurrentStatus}`);

    // 6. Test Follow-Up creation
    console.log("6. Creating follow-up visit linked to original visit...");
    const createdFollowUp = await followUpService.createFollowUp({
      originalVisitId: siteVisitId,
      userId: testUserId,
      department: 'technical',
      siteInTime: new Date(),
      siteInLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 10,
        address: "123 Solar Street, Bangalore"
      },
      description: "Follow-up roof structure measurement",
      customer: fetchedVisit.customer,
      followUpReason: "additional_work_required"
    });
    followUpId = createdFollowUp.id;
    console.log(`✅ Follow-up created with ID: ${followUpId}`);

    // 7. Verify original visit updated with follow-up metadata
    console.log("7. Verifying original visit follow-up linkage...");
    const refreshedVisit = await siteVisitService.getSiteVisitById(siteVisitId);
    if (!refreshedVisit?.hasFollowUps || refreshedVisit.followUpCount !== 1) {
      throw new Error(`Original visit not updated with follow-up count`);
    }
    console.log(`✅ Original visit follow-up count verified: ${refreshedVisit.followUpCount}`);

    // 8. Test get follow-ups by original visit
    console.log("8. Testing getFollowUpsByOriginalVisit...");
    const followUps = await followUpService.getFollowUpsByOriginalVisit(siteVisitId);
    if (followUps.length === 0 || followUps[0].id !== followUpId) {
      throw new Error("getFollowUpsByOriginalVisit failed");
    }
    console.log(`✅ Found ${followUps.length} follow-up(s)`);

    // 9. Complete follow-up with 'completed' outcome -> should convert customer
    console.log("9. Completing follow-up visit with outcome 'completed' (conversion)...");
    const completedFollowUp = await followUpService.updateFollowUp(followUpId, {
      status: 'completed',
      siteOutTime: new Date(),
      visitOutcome: 'completed',
      outcomeNotes: "Customer agreed and signed quotation"
    });
    if (completedFollowUp.status !== 'completed' || completedFollowUp.newCustomerStatus !== 'converted') {
      throw new Error(`Expected newCustomerStatus 'converted', got ${completedFollowUp.newCustomerStatus}`);
    }
    console.log(`✅ Follow-up completed with new customer status: ${completedFollowUp.newCustomerStatus}`);

    // 10. Verify original visit dynamic customer status is now 'converted'
    console.log("10. Verifying original visit customerCurrentStatus transition to 'converted'...");
    const finalVisit = await siteVisitService.getSiteVisitById(siteVisitId);
    if (finalVisit?.customerCurrentStatus !== 'converted') {
      throw new Error(`Expected customerCurrentStatus 'converted', got ${finalVisit?.customerCurrentStatus}`);
    }
    console.log(`✅ Dynamic status verified on original visit: customerCurrentStatus=${finalVisit.customerCurrentStatus}`);

    // 11. Test site visit stats
    console.log("11. Testing site visit stats aggregation...");
    const stats = await siteVisitService.getSiteVisitStats({ department: 'technical' });
    console.log(`✅ Stats aggregated: total=${stats.total}, technical=${stats.byDepartment.technical}`);

    // 12. Cleanup
    console.log("12. Cleaning up test records...");
    await siteVisitService.deleteSiteVisit(siteVisitId);
    console.log("✅ Test site visit cleaned up.");

    console.log("\n🎉 ALL SITE VISIT & FOLLOW UP POSTGRESQL TESTS PASSED WITH 100% SUCCESS!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testSiteVisitAndFollowUpServices();
