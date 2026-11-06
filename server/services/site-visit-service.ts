/**
 * Site Visit Management Service - Enterprise PostgreSQL-First Architecture
 * Handles all field operations for Technical, Marketing, and Admin departments
 */

import { db as pgDb } from "../db";
import { siteVisits as pgSiteVisits } from "@shared/schema.postgres";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db as firestoreDb } from "../firebase";
import { Timestamp } from "firebase-admin/firestore";
import {
  SiteVisit,
  InsertSiteVisit,
  insertSiteVisitSchema,
  Location,
  CustomerDetails,
  TechnicalSiteVisit,
  MarketingSiteVisit,
  AdminSiteVisit,
  SitePhoto
} from "@shared/schema";
import crypto from "crypto";

export class SiteVisitService {
  private collection = firestoreDb.collection('siteVisits');

  /**
   * Helper to convert PostgreSQL row to standard SiteVisit
   */
  private convertPostgresToSiteVisit(v: any): SiteVisit {
    const originalPhotos = (v.sitePhotos || []).map((p: any) => ({
      ...p,
      timestamp: p.timestamp ? (p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp)) : new Date()
    }));
    const checkoutPhotos = (v.siteOutPhotos || []).map((p: any) => ({
      ...p,
      timestamp: p.timestamp ? (p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp)) : new Date()
    }));
    const allPhotos = [...originalPhotos, ...checkoutPhotos];

    return {
      id: v.id,
      userId: v.userId,
      department: v.department as any,
      visitPurpose: v.visitPurpose,
      status: v.status as any,
      siteInTime: v.siteInTime instanceof Date ? v.siteInTime : new Date(v.siteInTime),
      siteOutTime: v.siteOutTime ? (v.siteOutTime instanceof Date ? v.siteOutTime : new Date(v.siteOutTime)) : undefined,
      customer: v.customer as any,
      location: (v.location as any) || undefined,
      technicalData: (v.technicalData as any) || undefined,
      marketingData: (v.marketingData as any) || undefined,
      adminData: (v.adminData as any) || undefined,
      sitePhotos: allPhotos,
      siteOutPhotos: checkoutPhotos,
      isFollowUp: v.isFollowUp ?? false,
      followUpOf: v.followUpOf || undefined,
      hasFollowUps: v.hasFollowUps ?? false,
      followUpCount: v.followUpCount ?? 0,
      followUpReason: v.followUpReason || undefined,
      followUpDescription: v.followUpDescription || undefined,
      visitOutcome: v.visitOutcome || undefined,
      outcomeNotes: v.outcomeNotes || undefined,
      scheduledFollowUpDate: v.scheduledFollowUpDate ? (v.scheduledFollowUpDate instanceof Date ? v.scheduledFollowUpDate : new Date(v.scheduledFollowUpDate)) : undefined,
      outcomeSelectedAt: v.outcomeSelectedAt ? (v.outcomeSelectedAt instanceof Date ? v.outcomeSelectedAt : new Date(v.outcomeSelectedAt)) : undefined,
      outcomeSelectedBy: v.outcomeSelectedBy || undefined,
      customerCurrentStatus: v.customerCurrentStatus || undefined,
      lastActivityType: (v.lastActivityType as any) || "initial_visit",
      lastActivityDate: v.lastActivityDate ? (v.lastActivityDate instanceof Date ? v.lastActivityDate : new Date(v.lastActivityDate)) : new Date(),
      activeFollowUpId: v.activeFollowUpId || undefined,
      autoCorrected: v.autoCorrected ?? false,
      autoClosedAt: v.autoClosedAt ? (v.autoClosedAt instanceof Date ? v.autoClosedAt : new Date(v.autoClosedAt)) : undefined,
      autoCorrectionReason: v.autoCorrectionReason || undefined,
      notes: v.notes || undefined,
      createdAt: v.createdAt instanceof Date ? v.createdAt : new Date(v.createdAt),
      updatedAt: v.updatedAt instanceof Date ? v.updatedAt : new Date(v.updatedAt)
    };
  }

  /**
   * Helper to convert Firestore document data to SiteVisit
   */
  private convertFirestoreToSiteVisit(data: any): Omit<SiteVisit, 'id'> {
    const originalPhotos = (data.sitePhotos || []).map((photo: any) => ({
      ...photo,
      timestamp: photo.timestamp?.toDate ? photo.timestamp.toDate() : (photo.timestamp instanceof Date ? photo.timestamp : new Date())
    }));

    const checkoutPhotos = (data.siteOutPhotos || []).map((photo: any) => ({
      ...photo,
      timestamp: photo.timestamp?.toDate ? photo.timestamp.toDate() : (photo.timestamp instanceof Date ? photo.timestamp : new Date())
    }));

    const allPhotos = [...originalPhotos, ...checkoutPhotos];

    return {
      ...data,
      siteInTime: data.siteInTime?.toDate ? data.siteInTime.toDate() : (data.siteInTime instanceof Date ? data.siteInTime : new Date(data.siteInTime)),
      siteOutTime: data.siteOutTime?.toDate ? data.siteOutTime.toDate() : (data.siteOutTime ? new Date(data.siteOutTime) : undefined),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt || Date.now())),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt || Date.now())),
      scheduledFollowUpDate: data.scheduledFollowUpDate ? (data.scheduledFollowUpDate?.toDate ? data.scheduledFollowUpDate.toDate() : new Date(data.scheduledFollowUpDate)) : undefined,
      outcomeSelectedAt: data.outcomeSelectedAt ? (data.outcomeSelectedAt?.toDate ? data.outcomeSelectedAt.toDate() : new Date(data.outcomeSelectedAt)) : undefined,
      sitePhotos: allPhotos,
      siteOutPhotos: checkoutPhotos
    };
  }

  /**
   * Create a new site visit in PostgreSQL with safe Firestore replication
   */
  async createSiteVisit(data: InsertSiteVisit): Promise<SiteVisit> {
    try {
      const id = (data as any).id || crypto.randomUUID();
      const tenantId = (data as any).tenantId || "adc11a73-7ef8-417b-b930-28d1d855d707";
      const now = new Date();

      const insertValues: any = {
        id,
        tenantId,
        userId: data.userId,
        department: data.department,
        visitPurpose: data.visitPurpose,
        status: data.status || "in_progress",
        siteInTime: data.siteInTime instanceof Date ? data.siteInTime : new Date(data.siteInTime),
        siteOutTime: data.siteOutTime ? (data.siteOutTime instanceof Date ? data.siteOutTime : new Date(data.siteOutTime)) : null,
        customer: data.customer,
        location: data.location || null,
        technicalData: data.technicalData || null,
        marketingData: data.marketingData || null,
        adminData: data.adminData || null,
        sitePhotos: data.sitePhotos || [],
        siteOutPhotos: data.siteOutPhotos || [],
        isFollowUp: data.isFollowUp ?? false,
        followUpOf: data.followUpOf || null,
        hasFollowUps: data.hasFollowUps ?? false,
        followUpCount: data.followUpCount ?? 0,
        followUpReason: data.followUpReason || null,
        followUpDescription: data.followUpDescription || null,
        visitOutcome: data.visitOutcome || null,
        outcomeNotes: data.outcomeNotes || null,
        scheduledFollowUpDate: data.scheduledFollowUpDate ? (data.scheduledFollowUpDate instanceof Date ? data.scheduledFollowUpDate : new Date(data.scheduledFollowUpDate)) : null,
        outcomeSelectedAt: data.outcomeSelectedAt ? (data.outcomeSelectedAt instanceof Date ? data.outcomeSelectedAt : new Date(data.outcomeSelectedAt)) : null,
        outcomeSelectedBy: data.outcomeSelectedBy || null,
        customerCurrentStatus: data.customerCurrentStatus || null,
        lastActivityType: data.lastActivityType || "initial_visit",
        lastActivityDate: data.lastActivityDate ? (data.lastActivityDate instanceof Date ? data.lastActivityDate : new Date(data.lastActivityDate)) : now,
        activeFollowUpId: data.activeFollowUpId || null,
        autoCorrected: data.autoCorrected ?? false,
        autoClosedAt: data.autoClosedAt ? (data.autoClosedAt instanceof Date ? data.autoClosedAt : new Date(data.autoClosedAt)) : null,
        autoCorrectionReason: data.autoCorrectionReason || null,
        notes: data.notes || null,
        createdAt: data.createdAt ? (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt)) : now,
        updatedAt: data.updatedAt ? (data.updatedAt instanceof Date ? data.updatedAt : new Date(data.updatedAt)) : now
      };

      const [created] = await pgDb.insert(pgSiteVisits).values(insertValues).returning();

      // Dual-write to Firestore asynchronously
      (async () => {
        try {
          const firestoreData: any = {
            ...insertValues,
            siteInTime: Timestamp.fromDate(insertValues.siteInTime),
            siteOutTime: insertValues.siteOutTime ? Timestamp.fromDate(insertValues.siteOutTime) : null,
            createdAt: Timestamp.fromDate(insertValues.createdAt),
            updatedAt: Timestamp.fromDate(insertValues.updatedAt),
            scheduledFollowUpDate: insertValues.scheduledFollowUpDate ? Timestamp.fromDate(insertValues.scheduledFollowUpDate) : null,
            outcomeSelectedAt: insertValues.outcomeSelectedAt ? Timestamp.fromDate(insertValues.outcomeSelectedAt) : null,
            lastActivityDate: insertValues.lastActivityDate ? Timestamp.fromDate(insertValues.lastActivityDate) : null,
            sitePhotos: insertValues.sitePhotos?.map((p: any) => ({
              ...p,
              timestamp: p.timestamp ? (p.timestamp instanceof Date ? Timestamp.fromDate(p.timestamp) : Timestamp.fromDate(new Date(p.timestamp))) : Timestamp.fromDate(new Date())
            })) || []
          };
          Object.keys(firestoreData).forEach(k => firestoreData[k] === undefined && delete firestoreData[k]);
          await this.collection.doc(id).set(firestoreData);
        } catch (err) {
          console.warn("[SiteVisitService] Dual-write to Firestore warning:", err);
        }
      })();

      return this.convertPostgresToSiteVisit(created);
    } catch (error) {
      console.error('SITE_VISIT_SERVICE: Error creating site visit:', error);
      throw new Error(`Failed to create site visit: ${(error as Error).message}`);
    }
  }

  /**
   * Update site visit in PostgreSQL with safe Firestore replication
   */
  async updateSiteVisit(id: string, updates: Partial<InsertSiteVisit>): Promise<SiteVisit> {
    try {
      const pgUpdates: any = { updatedAt: new Date() };

      if (updates.status !== undefined) pgUpdates.status = updates.status;
      if (updates.siteOutTime !== undefined) pgUpdates.siteOutTime = updates.siteOutTime ? (updates.siteOutTime instanceof Date ? updates.siteOutTime : new Date(updates.siteOutTime)) : null;
      if (updates.technicalData !== undefined) pgUpdates.technicalData = updates.technicalData;
      if (updates.marketingData !== undefined) pgUpdates.marketingData = updates.marketingData;
      if (updates.adminData !== undefined) pgUpdates.adminData = updates.adminData;
      if (updates.notes !== undefined) pgUpdates.notes = updates.notes;
      if (updates.sitePhotos !== undefined) pgUpdates.sitePhotos = updates.sitePhotos;
      if (updates.siteOutPhotos !== undefined) pgUpdates.siteOutPhotos = updates.siteOutPhotos;
      if (updates.hasFollowUps !== undefined) pgUpdates.hasFollowUps = updates.hasFollowUps;
      if (updates.followUpCount !== undefined) pgUpdates.followUpCount = updates.followUpCount;
      if (updates.isFollowUp !== undefined) pgUpdates.isFollowUp = updates.isFollowUp;
      if (updates.followUpOf !== undefined) pgUpdates.followUpOf = updates.followUpOf;
      if (updates.followUpReason !== undefined) pgUpdates.followUpReason = updates.followUpReason;
      if (updates.followUpDescription !== undefined) pgUpdates.followUpDescription = updates.followUpDescription;
      if (updates.visitOutcome !== undefined) pgUpdates.visitOutcome = updates.visitOutcome;
      if (updates.outcomeNotes !== undefined) pgUpdates.outcomeNotes = updates.outcomeNotes;
      if (updates.scheduledFollowUpDate !== undefined) pgUpdates.scheduledFollowUpDate = updates.scheduledFollowUpDate ? (updates.scheduledFollowUpDate instanceof Date ? updates.scheduledFollowUpDate : new Date(updates.scheduledFollowUpDate)) : null;
      if (updates.outcomeSelectedAt !== undefined) pgUpdates.outcomeSelectedAt = updates.outcomeSelectedAt ? (updates.outcomeSelectedAt instanceof Date ? updates.outcomeSelectedAt : new Date(updates.outcomeSelectedAt)) : null;
      if (updates.outcomeSelectedBy !== undefined) pgUpdates.outcomeSelectedBy = updates.outcomeSelectedBy;
      if (updates.customerCurrentStatus !== undefined) pgUpdates.customerCurrentStatus = updates.customerCurrentStatus;
      if (updates.lastActivityType !== undefined) pgUpdates.lastActivityType = updates.lastActivityType;
      if (updates.lastActivityDate !== undefined) pgUpdates.lastActivityDate = updates.lastActivityDate ? (updates.lastActivityDate instanceof Date ? updates.lastActivityDate : new Date(updates.lastActivityDate)) : new Date();
      if (updates.activeFollowUpId !== undefined) pgUpdates.activeFollowUpId = updates.activeFollowUpId;
      if (updates.autoCorrected !== undefined) pgUpdates.autoCorrected = updates.autoCorrected;
      if (updates.autoClosedAt !== undefined) pgUpdates.autoClosedAt = updates.autoClosedAt ? (updates.autoClosedAt instanceof Date ? updates.autoClosedAt : new Date(updates.autoClosedAt)) : null;
      if (updates.autoCorrectionReason !== undefined) pgUpdates.autoCorrectionReason = updates.autoCorrectionReason;

      const [updated] = await pgDb.update(pgSiteVisits).set(pgUpdates).where(eq(pgSiteVisits.id, id)).returning();

      if (!updated) {
        // Fallback check Firestore
        const docRef = this.collection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
          throw new Error('Site visit not found');
        }
        await docRef.update({ ...updates, updatedAt: Timestamp.fromDate(new Date()) });
        const refreshed = await docRef.get();
        return { id: refreshed.id, ...this.convertFirestoreToSiteVisit(refreshed.data()!) };
      }

      // Replicate updates to Firestore in background
      (async () => {
        try {
          const docRef = this.collection.doc(id);
          const firestoreUpdates: any = { ...updates, updatedAt: Timestamp.fromDate(new Date()) };
          if (updates.siteOutTime) firestoreUpdates.siteOutTime = Timestamp.fromDate(new Date(updates.siteOutTime));
          if (updates.scheduledFollowUpDate) firestoreUpdates.scheduledFollowUpDate = Timestamp.fromDate(new Date(updates.scheduledFollowUpDate));
          if (updates.outcomeSelectedAt) firestoreUpdates.outcomeSelectedAt = Timestamp.fromDate(new Date(updates.outcomeSelectedAt));
          Object.keys(firestoreUpdates).forEach(k => firestoreUpdates[k] === undefined && delete firestoreUpdates[k]);
          await docRef.set(firestoreUpdates, { merge: true });
        } catch (err) {
          console.warn("[SiteVisitService] Firestore async update warning:", err);
        }
      })();

      return this.convertPostgresToSiteVisit(updated);
    } catch (error) {
      console.error('SITE_VISIT_SERVICE: Error updating site visit:', error);
      throw new Error(`Failed to update site visit: ${(error as Error).message}`);
    }
  }

  /**
   * Get site visit by ID (PostgreSQL first, Firestore fallback)
   */
  async getSiteVisitById(id: string): Promise<SiteVisit | null> {
    try {
      const [v] = await pgDb.select().from(pgSiteVisits).where(eq(pgSiteVisits.id, id)).limit(1);
      if (v) {
        return this.convertPostgresToSiteVisit(v);
      }

      // Fallback to Firestore
      const doc = await this.collection.doc(id).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()!) };
    } catch (error) {
      console.error('Error getting site visit:', error);
      throw new Error('Failed to get site visit');
    }
  }

  /**
   * Get site visits by user ID
   */
  async getSiteVisitsByUser(userId: string, limit = 50): Promise<SiteVisit[]> {
    try {
      const rows = await pgDb.select()
        .from(pgSiteVisits)
        .where(eq(pgSiteVisits.userId, userId))
        .orderBy(desc(pgSiteVisits.siteInTime))
        .limit(limit);

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting user site visits:', error);
      // Fallback to Firestore
      const snapshot = await this.collection
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()) }));
    }
  }

  /**
   * Get site visits by department
   */
  async getSiteVisitsByDepartment(department: 'technical' | 'marketing' | 'admin', limit = 100): Promise<SiteVisit[]> {
    try {
      const rows = await pgDb.select()
        .from(pgSiteVisits)
        .where(eq(pgSiteVisits.department, department))
        .orderBy(desc(pgSiteVisits.siteInTime))
        .limit(limit);

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting department site visits:', error);
      const snapshot = await this.collection
        .where('department', '==', department)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()) }));
    }
  }

  /**
   * Get active (in-progress) site visits
   */
  async getActiveSiteVisits(): Promise<SiteVisit[]> {
    try {
      const rows = await pgDb.select()
        .from(pgSiteVisits)
        .where(eq(pgSiteVisits.status, 'in_progress'))
        .orderBy(desc(pgSiteVisits.siteInTime));

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting active site visits:', error);
      const snapshot = await this.collection.where('status', '==', 'in_progress').get();
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()) }));
      return results.sort((a, b) => b.siteInTime.getTime() - a.siteInTime.getTime());
    }
  }

  /**
   * Get site visits by date range
   */
  async getSiteVisitsByDateRange(startDate: Date, endDate: Date): Promise<SiteVisit[]> {
    try {
      const rows = await pgDb.select()
        .from(pgSiteVisits)
        .where(and(
          gte(pgSiteVisits.siteInTime, startDate),
          lte(pgSiteVisits.siteInTime, endDate)
        ))
        .orderBy(desc(pgSiteVisits.siteInTime));

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting site visits by date range:', error);
      const snapshot = await this.collection
        .where('siteInTime', '>=', Timestamp.fromDate(startDate))
        .where('siteInTime', '<=', Timestamp.fromDate(endDate))
        .orderBy('siteInTime', 'desc')
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()) }));
    }
  }

  /**
   * Get site visits with dynamic filters (using indexed SQL queries)
   */
  async getSiteVisitsWithFilters(filters: {
    userId?: string;
    department?: 'technical' | 'marketing' | 'admin';
    status?: 'in_progress' | 'completed' | 'cancelled';
    visitPurpose?: string;
    customerCurrentStatus?: 'converted' | 'on_process' | 'cancelled';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<SiteVisit[]> {
    try {
      const conditions: any[] = [];

      if (filters.userId) conditions.push(eq(pgSiteVisits.userId, filters.userId));
      if (filters.department) conditions.push(eq(pgSiteVisits.department, filters.department));
      if (filters.status) conditions.push(eq(pgSiteVisits.status, filters.status));
      if (filters.visitPurpose) conditions.push(eq(pgSiteVisits.visitPurpose, filters.visitPurpose));
      if (filters.customerCurrentStatus) conditions.push(eq(pgSiteVisits.customerCurrentStatus, filters.customerCurrentStatus));
      if (filters.startDate) conditions.push(gte(pgSiteVisits.siteInTime, filters.startDate));
      if (filters.endDate) conditions.push(lte(pgSiteVisits.siteInTime, filters.endDate));

      let query = pgDb.select().from(pgSiteVisits);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const rows = await query
        .orderBy(desc(pgSiteVisits.siteInTime))
        .limit(filters.limit || 100);

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting filtered site visits:', error);
      // Fallback to in-memory Firestore filtering
      let query: any = this.collection;
      if (filters.userId) query = query.where('userId', '==', filters.userId);
      else if (filters.department) query = query.where('department', '==', filters.department);

      const snapshot = await query.limit(filters.limit || 100).get();
      let results = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...this.convertFirestoreToSiteVisit(doc.data())
      }));

      if (filters.status) results = results.filter(sv => sv.status === filters.status);
      if (filters.startDate) results = results.filter(sv => sv.siteInTime >= filters.startDate!);
      if (filters.endDate) results = results.filter(sv => sv.siteInTime <= filters.endDate!);
      if (filters.visitPurpose) results = results.filter(sv => sv.visitPurpose === filters.visitPurpose);
      if (filters.customerCurrentStatus) {
        results = results.filter(sv => (sv.customerCurrentStatus || sv.visitOutcome) === filters.customerCurrentStatus);
      }
      return results.sort((a, b) => b.siteInTime.getTime() - a.siteInTime.getTime());
    }
  }

  /**
   * Delete site visit from PostgreSQL and Firestore
   */
  async deleteSiteVisit(id: string): Promise<void> {
    try {
      await pgDb.delete(pgSiteVisits).where(eq(pgSiteVisits.id, id));
      try {
        await this.collection.doc(id).delete();
      } catch (fbErr) {
        console.warn("[SiteVisitService] Firestore async delete warning:", fbErr);
      }
    } catch (error) {
      console.error('Error deleting site visit:', error);
      throw new Error('Failed to delete site visit');
    }
  }

  /**
   * Add photos to existing site visit
   */
  async addSitePhotos(siteVisitId: string, photos: SitePhoto[]): Promise<SiteVisit> {
    try {
      const existing = await this.getSiteVisitById(siteVisitId);
      if (!existing) {
        throw new Error('Site visit not found');
      }

      const currentPhotos = existing.sitePhotos || [];
      const updatedPhotos = [...currentPhotos, ...photos].slice(0, 20);

      return await this.updateSiteVisit(siteVisitId, {
        sitePhotos: updatedPhotos
      });
    } catch (error) {
      console.error('Error adding site photos:', error);
      throw new Error('Failed to add site photos');
    }
  }

  /**
   * Get site visit analytics/statistics directly from PostgreSQL
   */
  async getSiteVisitStats(filters?: {
    department?: 'technical' | 'marketing' | 'admin';
    startDate?: Date;
    endDate?: Date;
  }) {
    try {
      const conditions: any[] = [];
      if (filters?.department) conditions.push(eq(pgSiteVisits.department, filters.department));
      if (filters?.startDate) conditions.push(gte(pgSiteVisits.siteInTime, filters.startDate));
      if (filters?.endDate) conditions.push(lte(pgSiteVisits.siteInTime, filters.endDate));

      let query = pgDb.select().from(pgSiteVisits);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const rows = await query;
      return {
        total: rows.length,
        inProgress: rows.filter(r => r.status === 'in_progress').length,
        completed: rows.filter(r => r.status === 'completed').length,
        cancelled: rows.filter(r => r.status === 'cancelled').length,
        byDepartment: {
          technical: rows.filter(r => r.department === 'technical').length,
          marketing: rows.filter(r => r.department === 'marketing').length,
          admin: rows.filter(r => r.department === 'admin').length
        },
        byPurpose: rows.reduce((acc: any, r) => {
          acc[r.visitPurpose] = (acc[r.visitPurpose] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
    } catch (error) {
      console.error('Error getting site visit stats:', error);
      throw new Error('Failed to get site visit statistics');
    }
  }

  /**
   * Get all site visits for monitoring dashboard
   */
  async getAllSiteVisitsForMonitoring(): Promise<SiteVisit[]> {
    try {
      const rows = await pgDb.select()
        .from(pgSiteVisits)
        .orderBy(desc(pgSiteVisits.siteInTime))
        .limit(500);

      return rows.map(r => this.convertPostgresToSiteVisit(r));
    } catch (error) {
      console.error('Error getting site visits for monitoring:', error);
      const snapshot = await this.collection.orderBy('siteInTime', 'desc').limit(500).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...this.convertFirestoreToSiteVisit(doc.data()) }));
    }
  }

  /**
   * Quick update site visit outcome (convert, cancel, reschedule)
   */
  async quickUpdateSiteVisit(id: string, action: 'convert' | 'cancel' | 'reschedule', options: {
    scheduledFollowUpDate?: Date;
    outcomeNotes?: string;
    reason?: string;
    userId: string;
  }): Promise<SiteVisit> {
    try {
      const now = new Date();
      const updateData: Partial<InsertSiteVisit> = {
        updatedAt: now,
        outcomeSelectedAt: now,
        outcomeSelectedBy: options.userId
      };

      switch (action) {
        case 'convert':
          updateData.visitOutcome = 'converted';
          updateData.status = 'completed';
          updateData.customerCurrentStatus = 'converted';
          updateData.scheduledFollowUpDate = null as any;
          if (options.outcomeNotes) updateData.outcomeNotes = options.outcomeNotes;
          break;

        case 'cancel':
          updateData.visitOutcome = 'cancelled';
          updateData.status = 'cancelled';
          updateData.customerCurrentStatus = 'cancelled';
          updateData.scheduledFollowUpDate = null as any;
          if (options.reason || options.outcomeNotes) {
            updateData.outcomeNotes = options.reason || options.outcomeNotes || 'Visit cancelled';
          }
          break;

        case 'reschedule':
          if (!options.scheduledFollowUpDate) {
            throw new Error('Scheduled follow-up date is required for reschedule action');
          }
          updateData.visitOutcome = 'on_process';
          updateData.customerCurrentStatus = 'on_process';
          updateData.scheduledFollowUpDate = options.scheduledFollowUpDate;
          if (options.reason || options.outcomeNotes) {
            updateData.outcomeNotes = options.reason || options.outcomeNotes || 'Visit rescheduled';
          }
          delete updateData.outcomeSelectedAt;
          delete updateData.outcomeSelectedBy;
          break;

        default:
          throw new Error(`Invalid quick action: ${action}`);
      }

      return await this.updateSiteVisit(id, updateData);
    } catch (error) {
      console.error('Error in quick update:', error);
      throw new Error(`Failed to quick update site visit: ${(error as Error).message}`);
    }
  }

  /**
   * Export site visits to Excel format directly from PostgreSQL
   */
  async exportSiteVisitsToExcel(filters?: {
    department?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Buffer> {
    try {
      const XLSX = await import('xlsx');
      const conditions: any[] = [];
      if (filters?.department) conditions.push(eq(pgSiteVisits.department, filters.department));
      if (filters?.status) conditions.push(eq(pgSiteVisits.status, filters.status));
      if (filters?.startDate) conditions.push(gte(pgSiteVisits.siteInTime, filters.startDate));
      if (filters?.endDate) conditions.push(lte(pgSiteVisits.siteInTime, filters.endDate));

      let query = pgDb.select().from(pgSiteVisits);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const rows = await query.orderBy(desc(pgSiteVisits.siteInTime));
      const siteVisits = rows.map(r => this.convertPostgresToSiteVisit(r));

      const excelData = siteVisits.map((visit: any) => {
        const baseData: any = {
          'Visit ID': visit.id,
          'Employee Name': visit.userId,
          'Department': visit.department,
          'Customer Name': (visit as any).customer?.name || (visit as any).customerDetails?.name || 'N/A',
          'Customer Phone': (visit as any).customer?.phone || (visit as any).customer?.mobile || 'N/A',
          'Customer Email': (visit as any).customer?.email || 'N/A',
          'Customer Source': (visit as any).customer?.source || 'N/A',
          'Visit Purpose': visit.visitPurpose,
          'Status': visit.status,
          'Visit Outcome': visit.visitOutcome || 'N/A',
          'Check-in Time': visit.siteInTime?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A',
          'Check-in Location': visit.location?.address || 'N/A',
          'Check-out Time': visit.siteOutTime ? visit.siteOutTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not checked out',
          'Notes': visit.notes || 'N/A',
          'Photos Count': visit.sitePhotos?.length || 0,
          'Created At': visit.createdAt?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) || 'N/A'
        };

        if (visit.marketingData) {
          const config = visit.marketingData.onGridConfig || visit.marketingData.offGridConfig ||
            visit.marketingData.hybridConfig || visit.marketingData.waterPumpConfig;
          if (config) {
            baseData['Panel Watts'] = config.panelWatts || 'N/A';
            baseData['Inverter KW'] = config.inverterKW || 'N/A';
            baseData['Project Value'] = config.projectValue || 'N/A';
          }
        }
        return baseData;
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Site Visits');
      return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      console.error('Error exporting site visits to Excel:', error);
      throw new Error('Failed to export site visits to Excel');
    }
  }

  /**
   * Helper alias for getting all site visits
   */
  async getAllSiteVisits(filters: any): Promise<SiteVisit[]> {
    return this.getSiteVisitsWithFilters(filters);
  }
}

// Export singleton instance
export const siteVisitService = new SiteVisitService();
