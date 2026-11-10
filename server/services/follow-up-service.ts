/**
 * Follow-Up Site Visit Service - Enterprise PostgreSQL-First Architecture
 * Handles follow-up visit data separately from main site visits
 */

import { db as pgDb } from "../db";
import { followUpVisits as pgFollowUpVisits, siteVisits as pgSiteVisits, tenants } from "@shared/schema.postgres";
import { eq, and, desc } from "drizzle-orm";
import { db as firestoreDb } from "../firebase";
import { Timestamp } from "firebase-admin/firestore";
import {
  FollowUpSiteVisit,
  InsertFollowUpSiteVisit,
  insertFollowUpSiteVisitSchema,
  Location,
  CustomerDetails
} from "@shared/schema";
import { siteVisitService } from "./site-visit-service";
import crypto from "crypto";

export class FollowUpService {
  private collection = firestoreDb.collection('followUpVisits');
  private siteVisitsCollection = firestoreDb.collection('siteVisits');
  private defaultTenantId: string | null = null;

  private async getTenantId(tenantId?: string): Promise<string> {
    if (tenantId) return tenantId;
    if (this.defaultTenantId) return this.defaultTenantId;
    try {
      const [defaultTenant] = await pgDb.select().from(tenants).where(eq(tenants.slug, "default")).limit(1);
      if (defaultTenant) {
        this.defaultTenantId = defaultTenant.id;
        return defaultTenant.id;
      }
    } catch (_) {}
    return "adc11a73-7ef8-417b-b930-28d1d855d707";
  }

  /**
   * Helper to convert PostgreSQL row to standard FollowUpSiteVisit
   */
  private convertPostgresToFollowUp(v: any): FollowUpSiteVisit {
    return {
      id: v.id,
      originalVisitId: v.originalVisitId || "",
      userId: v.userId,
      department: v.department as any,
      siteInTime: v.siteInTime instanceof Date ? v.siteInTime : new Date(v.siteInTime),
      siteInLocation: (v.siteInLocation as any) || undefined,
      siteInPhotoUrl: v.siteInPhotoUrl || undefined,
      siteOutTime: v.siteOutTime ? (v.siteOutTime instanceof Date ? v.siteOutTime : new Date(v.siteOutTime)) : undefined,
      siteOutLocation: (v.siteOutLocation as any) || undefined,
      siteOutPhotoUrl: v.siteOutPhotoUrl || undefined,
      siteOutPhotos: (v.siteOutPhotos as any[]) || [],
      followUpReason: (v.followUpReason as any) || "additional_work_required",
      description: v.description,
      sitePhotos: (v.sitePhotos as any[]) || [],
      status: v.status as any,
      notes: v.notes || undefined,
      customer: v.customer as any,
      createdAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      updatedAt: v.updatedAt instanceof Date ? v.updatedAt : new Date(v.updatedAt),
      originalCustomerStatus: (v.originalCustomerStatus as any) || undefined,
      affectsCustomerStatus: v.affectsCustomerStatus ?? true,
      newCustomerStatus: (v.newCustomerStatus as any) || undefined,
      visitOutcome: (v.visitOutcome as any) || undefined,
      outcomeNotes: v.outcomeNotes || undefined,
      scheduledFollowUpDate: v.scheduledFollowUpDate ? (v.scheduledFollowUpDate instanceof Date ? v.scheduledFollowUpDate : new Date(v.scheduledFollowUpDate)) : undefined,
      outcomeSelectedAt: (v as any).outcomeSelectedAt ? (v.outcomeSelectedAt instanceof Date ? v.outcomeSelectedAt : new Date(v.outcomeSelectedAt)) : undefined,
      outcomeSelectedBy: (v as any).outcomeSelectedBy || undefined
    };
  }

  /**
   * Helper to convert Firestore document to FollowUpSiteVisit object
   */
  private convertFirestoreToFollowUp(data: any): Omit<FollowUpSiteVisit, 'id'> {
    return {
      originalVisitId: data.originalVisitId,
      userId: data.userId,
      department: data.department,
      siteInTime: data.siteInTime?.toDate ? data.siteInTime.toDate() : (data.siteInTime instanceof Date ? data.siteInTime : new Date(data.siteInTime)),
      siteInLocation: data.siteInLocation,
      siteInPhotoUrl: data.siteInPhotoUrl,
      siteOutTime: data.siteOutTime?.toDate ? data.siteOutTime.toDate() : (data.siteOutTime ? new Date(data.siteOutTime) : undefined),
      siteOutLocation: data.siteOutLocation,
      siteOutPhotoUrl: data.siteOutPhotoUrl,
      siteOutPhotos: Array.isArray(data.siteOutPhotos) ? data.siteOutPhotos : [],
      followUpReason: data.followUpReason,
      description: data.description,
      sitePhotos: data.sitePhotos || [],
      status: data.status || 'in_progress',
      notes: data.notes,
      customer: data.customer,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt || Date.now())),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt || Date.now())),
      originalCustomerStatus: data.originalCustomerStatus,
      affectsCustomerStatus: data.affectsCustomerStatus ?? true,
      newCustomerStatus: data.newCustomerStatus,
      visitOutcome: data.visitOutcome,
      outcomeNotes: data.outcomeNotes,
      scheduledFollowUpDate: data.scheduledFollowUpDate?.toDate ? data.scheduledFollowUpDate.toDate() : (data.scheduledFollowUpDate ? new Date(data.scheduledFollowUpDate) : undefined),
      outcomeSelectedAt: data.outcomeSelectedAt?.toDate ? data.outcomeSelectedAt.toDate() : (data.outcomeSelectedAt ? new Date(data.outcomeSelectedAt) : undefined),
      outcomeSelectedBy: data.outcomeSelectedBy
    };
  }

  /**
   * Create a new follow-up visit with dynamic status management in PostgreSQL
   */
  async createFollowUp(data: InsertFollowUpSiteVisit): Promise<FollowUpSiteVisit> {
    try {
      const validatedData = insertFollowUpSiteVisitSchema.parse(data);

      // Check original visit (PostgreSQL first)
      const originalVisit = await siteVisitService.getSiteVisitById(validatedData.originalVisitId);
      if (!originalVisit) {
        throw new Error(`Original visit ${validatedData.originalVisitId} not found`);
      }

      const currentCustomerStatus = originalVisit.customerCurrentStatus || originalVisit.visitOutcome;
      if (!currentCustomerStatus) {
        throw new Error(`Original visit ${validatedData.originalVisitId} has no customer status - cannot create follow-up`);
      }

      const id = crypto.randomUUID();
      const tenantId = await this.getTenantId((data as any).tenantId);
      const now = new Date();

      const insertValues: any = {
        id,
        tenantId,
        originalVisitId: validatedData.originalVisitId,
        userId: validatedData.userId,
        department: validatedData.department,
        siteInTime: validatedData.siteInTime instanceof Date ? validatedData.siteInTime : new Date(validatedData.siteInTime),
        siteInLocation: validatedData.siteInLocation || null,
        siteInPhotoUrl: validatedData.siteInPhotoUrl || null,
        siteOutTime: validatedData.siteOutTime ? (validatedData.siteOutTime instanceof Date ? validatedData.siteOutTime : new Date(validatedData.siteOutTime)) : null,
        siteOutLocation: validatedData.siteOutLocation || null,
        siteOutPhotoUrl: validatedData.siteOutPhotoUrl || null,
        followUpReason: validatedData.followUpReason || "additional_work_required",
        description: validatedData.description,
        originalCustomerStatus: currentCustomerStatus,
        affectsCustomerStatus: true,
        newCustomerStatus: validatedData.newCustomerStatus || null,
        sitePhotos: validatedData.sitePhotos || [],
        siteOutPhotos: validatedData.siteOutPhotos || [],
        status: validatedData.status || "in_progress",
        visitOutcome: validatedData.visitOutcome || null,
        outcomeNotes: validatedData.outcomeNotes || null,
        scheduledFollowUpDate: validatedData.scheduledFollowUpDate ? (validatedData.scheduledFollowUpDate instanceof Date ? validatedData.scheduledFollowUpDate : new Date(validatedData.scheduledFollowUpDate)) : null,
        customer: validatedData.customer,
        notes: validatedData.notes || null,
        createdAt: validatedData.createdAt ? (validatedData.createdAt instanceof Date ? validatedData.createdAt : new Date(validatedData.createdAt)) : now,
        updatedAt: validatedData.updatedAt ? (validatedData.updatedAt instanceof Date ? validatedData.updatedAt : new Date(validatedData.updatedAt)) : now
      };

      const [created] = await pgDb.insert(pgFollowUpVisits).values(insertValues).returning();

      // Update original visit in PostgreSQL
      const currentCount = originalVisit.followUpCount || 0;
      await siteVisitService.updateSiteVisit(validatedData.originalVisitId, {
        followUpCount: currentCount + 1,
        hasFollowUps: true,
        customerCurrentStatus: "on_process",
        lastActivityType: "follow_up",
        lastActivityDate: now,
        activeFollowUpId: id
      });

      // Dual-write to Firestore in background
      (async () => {
        try {
          const firestoreData: any = {
            ...insertValues,
            siteInTime: Timestamp.fromDate(insertValues.siteInTime),
            siteOutTime: insertValues.siteOutTime ? Timestamp.fromDate(insertValues.siteOutTime) : null,
            createdAt: Timestamp.fromDate(insertValues.createdAt),
            updatedAt: Timestamp.fromDate(insertValues.updatedAt)
          };
          Object.keys(firestoreData).forEach(k => firestoreData[k] === undefined && delete firestoreData[k]);
          await this.collection.doc(id).set(firestoreData);

          // Update original visit doc in Firestore
          await this.siteVisitsCollection.doc(validatedData.originalVisitId).set({
            followUpCount: currentCount + 1,
            hasFollowUps: true,
            customerCurrentStatus: "on_process",
            lastActivityType: "follow_up",
            lastActivityDate: Timestamp.fromDate(now),
            activeFollowUpId: id,
            updatedAt: Timestamp.fromDate(now)
          }, { merge: true });
        } catch (err) {
          console.warn("[FollowUpService] Firestore sync warning:", err);
        }
      })();

      return this.convertPostgresToFollowUp(created);
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error creating follow-up:', error);
      throw new Error(`Failed to create follow-up visit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update follow-up visit with dynamic status management (for check-out)
   */
  async updateFollowUp(id: string, updates: Partial<InsertFollowUpSiteVisit>): Promise<FollowUpSiteVisit> {
    try {
      const now = new Date();
      const pgUpdates: any = { updatedAt: now };

      if (updates.siteOutTime !== undefined) pgUpdates.siteOutTime = updates.siteOutTime ? (updates.siteOutTime instanceof Date ? updates.siteOutTime : new Date(updates.siteOutTime)) : null;
      if (updates.siteOutLocation !== undefined) pgUpdates.siteOutLocation = updates.siteOutLocation;
      if (updates.siteOutPhotoUrl !== undefined) pgUpdates.siteOutPhotoUrl = updates.siteOutPhotoUrl;
      if (updates.siteOutPhotos !== undefined) pgUpdates.siteOutPhotos = updates.siteOutPhotos;
      if (updates.sitePhotos !== undefined) pgUpdates.sitePhotos = updates.sitePhotos;
      if (updates.status !== undefined) pgUpdates.status = updates.status;
      if (updates.visitOutcome !== undefined) pgUpdates.visitOutcome = updates.visitOutcome;
      if (updates.outcomeNotes !== undefined) pgUpdates.outcomeNotes = updates.outcomeNotes;
      if (updates.scheduledFollowUpDate !== undefined) pgUpdates.scheduledFollowUpDate = updates.scheduledFollowUpDate ? (updates.scheduledFollowUpDate instanceof Date ? updates.scheduledFollowUpDate : new Date(updates.scheduledFollowUpDate)) : null;
      if (updates.notes !== undefined) pgUpdates.notes = updates.notes;

      // Handle visit outcome completion status transition
      if (updates.visitOutcome && updates.status === 'completed') {
        let newCustomerStatus: "converted" | "on_process" | "cancelled";
        switch (updates.visitOutcome) {
          case "completed": newCustomerStatus = "converted"; break;
          case "on_process": newCustomerStatus = "on_process"; break;
          case "cancelled": newCustomerStatus = "cancelled"; break;
          default: throw new Error(`Invalid follow-up outcome: ${updates.visitOutcome}`);
        }
        pgUpdates.newCustomerStatus = newCustomerStatus;
      }

      const [updated] = await pgDb.update(pgFollowUpVisits).set(pgUpdates).where(eq(pgFollowUpVisits.id, id)).returning();

      if (!updated) {
        throw new Error(`Follow-up ${id} not found`);
      }

      // If status changed to completed and we have an originalVisitId, update the original visit
      if (pgUpdates.newCustomerStatus && updated.originalVisitId) {
        await siteVisitService.updateSiteVisit(updated.originalVisitId, {
          customerCurrentStatus: pgUpdates.newCustomerStatus,
          lastActivityType: "follow_up",
          lastActivityDate: now,
          activeFollowUpId: null as any
        });
      }

      // Replicate to Firestore in background
      (async () => {
        try {
          const docRef = this.collection.doc(id);
          const firestoreUpdates: any = {
            ...updates,
            updatedAt: Timestamp.fromDate(now)
          };
          if (updates.siteOutTime) firestoreUpdates.siteOutTime = Timestamp.fromDate(new Date(updates.siteOutTime));
          if (updates.scheduledFollowUpDate) firestoreUpdates.scheduledFollowUpDate = Timestamp.fromDate(new Date(updates.scheduledFollowUpDate));
          if (pgUpdates.newCustomerStatus) firestoreUpdates.newCustomerStatus = pgUpdates.newCustomerStatus;
          Object.keys(firestoreUpdates).forEach(k => firestoreUpdates[k] === undefined && delete firestoreUpdates[k]);
          await docRef.set(firestoreUpdates, { merge: true });

          if (pgUpdates.newCustomerStatus && updated.originalVisitId) {
            await this.siteVisitsCollection.doc(updated.originalVisitId).set({
              customerCurrentStatus: pgUpdates.newCustomerStatus,
              lastActivityType: "follow_up",
              lastActivityDate: Timestamp.fromDate(now),
              activeFollowUpId: null,
              updatedAt: Timestamp.fromDate(now)
            }, { merge: true });
          }
        } catch (err) {
          console.warn("[FollowUpService] Firestore async update warning:", err);
        }
      })();

      return this.convertPostgresToFollowUp(updated);
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error updating follow-up:', error);
      throw new Error(`Failed to update follow-up visit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get follow-up by ID (PostgreSQL first, Firestore fallback)
   */
  async getFollowUpById(id: string): Promise<FollowUpSiteVisit | null> {
    try {
      const [v] = await pgDb.select().from(pgFollowUpVisits).where(eq(pgFollowUpVisits.id, id)).limit(1);
      if (v) {
        return this.convertPostgresToFollowUp(v);
      }

      const doc = await this.collection.doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...this.convertFirestoreToFollowUp(doc.data()!) };
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-up:', error);
      return null;
    }
  }

  /**
   * Get all follow-ups for an original visit
   */
  async getFollowUpsByOriginalVisit(originalVisitId: string, tenantId?: string): Promise<FollowUpSiteVisit[]> {
    try {
      const resolvedTenantId = await this.getTenantId(tenantId);
      const rows = await pgDb.select()
        .from(pgFollowUpVisits)
        .where(
          and(
            eq(pgFollowUpVisits.tenantId, resolvedTenantId),
            eq(pgFollowUpVisits.originalVisitId, originalVisitId)
          )
        )
        .orderBy(desc(pgFollowUpVisits.createdAt));

      return rows.map(r => this.convertPostgresToFollowUp(r));
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-ups for original visit:', error);
      const snapshot = await this.collection.where('originalVisitId', '==', originalVisitId).get();
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToFollowUp(doc.data()) }));
      return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  /**
   * Get ALL follow-ups (for admin/monitoring)
   */
  async getAllFollowUps(tenantId?: string): Promise<FollowUpSiteVisit[]> {
    try {
      const resolvedTenantId = await this.getTenantId(tenantId);
      const rows = await pgDb.select()
        .from(pgFollowUpVisits)
        .where(eq(pgFollowUpVisits.tenantId, resolvedTenantId))
        .orderBy(desc(pgFollowUpVisits.createdAt));

      return rows.map(r => this.convertPostgresToFollowUp(r));
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting all follow-ups:', error);
      const snapshot = await this.collection.get();
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToFollowUp(doc.data()) }));
      return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  /**
   * Get follow-ups by user with filtering
   */
  async getFollowUpsByUser(
    userId: string,
    department?: string,
    status?: string
  ): Promise<FollowUpSiteVisit[]> {
    try {
      const conditions: any[] = [eq(pgFollowUpVisits.userId, userId)];
      if (department) conditions.push(eq(pgFollowUpVisits.department, department));
      if (status) conditions.push(eq(pgFollowUpVisits.status, status));

      const rows = await pgDb.select()
        .from(pgFollowUpVisits)
        .where(and(...conditions))
        .orderBy(desc(pgFollowUpVisits.createdAt));

      return rows.map(r => this.convertPostgresToFollowUp(r));
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-ups by user:', error);
      const snapshot = await this.collection.where('userId', '==', userId).get();
      const docs = snapshot.docs
        .map(doc => ({ id: doc.id, ...this.convertFirestoreToFollowUp(doc.data()) }))
        .filter(doc => {
          if (department && doc.department !== department) return false;
          if (status && doc.status !== status) return false;
          return true;
        });
      return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }
}

// Export singleton instance
export const followUpService = new FollowUpService();
