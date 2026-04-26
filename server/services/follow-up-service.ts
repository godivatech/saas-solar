/**
 * Follow-Up Site Visit Service
 * Handles follow-up visit data separately from main site visits
 */

import { db } from "../firebase";
import { Timestamp } from "firebase-admin/firestore";
import {
  FollowUpSiteVisit,
  InsertFollowUpSiteVisit,
  insertFollowUpSiteVisitSchema,
  Location,
  CustomerDetails
} from "@shared/schema";

export class FollowUpService {
  private collection = db.collection('followUpVisits');
  private siteVisitsCollection = db.collection('siteVisits');

  /**
   * Create a new follow-up visit with dynamic status management
   */
  async createFollowUp(data: InsertFollowUpSiteVisit): Promise<FollowUpSiteVisit> {
    try {
      // Validate data
      const validatedData = insertFollowUpSiteVisitSchema.parse(data);

      // Get original visit to extract current customer status
      const originalVisitRef = this.siteVisitsCollection.doc(validatedData.originalVisitId);
      const originalVisitDoc = await originalVisitRef.get();

      if (!originalVisitDoc.exists) {
        throw new Error(`Original visit ${validatedData.originalVisitId} not found`);
      }

      const originalVisitData = originalVisitDoc.data()!;

      // Determine current customer status - use customerCurrentStatus if available, fallback to visitOutcome
      const currentCustomerStatus = originalVisitData.customerCurrentStatus || originalVisitData.visitOutcome;

      if (!currentCustomerStatus) {
        throw new Error(`Original visit ${validatedData.originalVisitId} has no customer status - cannot create follow-up`);
      }

      // Enhance follow-up data with status management context
      const enhancedData = {
        ...validatedData,
        originalCustomerStatus: currentCustomerStatus,
        affectsCustomerStatus: true
      };

      // Convert dates to Firestore timestamps
      const firestoreData: any = {
        ...enhancedData,
        siteInTime: Timestamp.fromDate(enhancedData.siteInTime),
        siteOutTime: enhancedData.siteOutTime ? Timestamp.fromDate(enhancedData.siteOutTime) : null,
        createdAt: Timestamp.fromDate(enhancedData.createdAt || new Date()),
        updatedAt: Timestamp.fromDate(enhancedData.updatedAt || new Date())
      };

      // Remove undefined values to prevent Firestore errors
      Object.keys(firestoreData).forEach(key => {
        if (firestoreData[key] === undefined) {
          delete firestoreData[key];
        }
      });

      // Create the follow-up document
      const docRef = await this.collection.add(firestoreData);

      // Update the original visit with dynamic status management
      try {
        const currentCount = originalVisitData.followUpCount || 0;
        const updateData = {
          followUpCount: currentCount + 1,
          hasFollowUps: true,
          // Dynamic Status Management - Move customer to "on_process" during follow-up
          customerCurrentStatus: "on_process",
          lastActivityType: "follow_up",
          lastActivityDate: Timestamp.fromDate(new Date()),
          activeFollowUpId: docRef.id,
          updatedAt: Timestamp.fromDate(new Date())
        };

        await originalVisitRef.update(updateData);
      } catch (error) {
        console.error("FOLLOW_UP_SERVICE: Error updating original visit with status management:", error);
        // Clean up the created follow-up if original visit update fails
        await docRef.delete();
        throw new Error('Failed to update original visit status - follow-up creation aborted');
      }

      const result = {
        id: docRef.id,
        ...this.convertFirestoreToFollowUp(firestoreData)
      };

      return result;
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error creating follow-up with status management:', error);
      throw new Error(`Failed to create follow-up visit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update follow-up visit with dynamic status management (for check-out)
   */
  async updateFollowUp(id: string, updates: Partial<InsertFollowUpSiteVisit>): Promise<FollowUpSiteVisit> {
    try {
      const docRef = this.collection.doc(id);

      // Get current follow-up data to access original visit info
      const currentFollowUpDoc = await docRef.get();
      if (!currentFollowUpDoc.exists) {
        throw new Error(`Follow-up ${id} not found`);
      }

      const currentFollowUpData = currentFollowUpDoc.data()!;
      const originalVisitId = currentFollowUpData.originalVisitId;

      // Convert dates to Firestore timestamps in updates
      const firestoreUpdates: any = {
        ...updates,
        updatedAt: Timestamp.fromDate(new Date())
      };

      if (updates.siteOutTime) {
        firestoreUpdates.siteOutTime = Timestamp.fromDate(updates.siteOutTime);
      }

      // Handle visit outcome completion with status transition logic
      if (updates.visitOutcome && updates.status === 'completed') {
        // Map follow-up outcome to customer status
        let newCustomerStatus: "converted" | "on_process" | "cancelled";
        switch (updates.visitOutcome) {
          case "completed":
            newCustomerStatus = "converted";
            break;
          case "on_process":
            newCustomerStatus = "on_process";
            break;
          case "cancelled":
            newCustomerStatus = "cancelled";
            break;
          default:
            throw new Error(`Invalid follow-up outcome: ${updates.visitOutcome}`);
        }

        // Store the new customer status in the follow-up
        firestoreUpdates.newCustomerStatus = newCustomerStatus;

        // Update original visit with the new customer status
        try {
          const originalVisitRef = this.siteVisitsCollection.doc(originalVisitId);
          const originalVisitDoc = await originalVisitRef.get();

          if (originalVisitDoc.exists) {
            const originalUpdateData = {
              // Update dynamic status based on follow-up outcome
              customerCurrentStatus: newCustomerStatus,
              lastActivityType: "follow_up",
              lastActivityDate: Timestamp.fromDate(new Date()),
              activeFollowUpId: null, // Clear active follow-up
              updatedAt: Timestamp.fromDate(new Date())
            };

            await originalVisitRef.update(originalUpdateData);
          } else {
            console.error("FOLLOW_UP_SERVICE: Original visit not found for status update:", originalVisitId);
          }
        } catch (error) {
          console.error("FOLLOW_UP_SERVICE: Error updating original visit with follow-up outcome:", error);
          // Continue with follow-up update even if original visit update fails
        }
      }

      // Handle siteOutPhotos - FIXED: Ensure proper URL string storage
      if (updates.siteOutPhotos && Array.isArray(updates.siteOutPhotos)) {
        // Always convert to simple string array to prevent corruption
        firestoreUpdates.siteOutPhotos = updates.siteOutPhotos.map((photo: any) => {
          if (typeof photo === 'string') {
            return photo; // Already a string URL
          } else if (photo && typeof photo === 'object' && photo.url) {
            return photo.url; // Extract URL from photo object
          } else {
            console.warn('FOLLOW_UP_SERVICE: Invalid photo format, skipping:', photo);
            return null;
          }
        }).filter(Boolean); // Remove null/undefined values

        // Additional validation to ensure all are strings
        const allStrings = firestoreUpdates.siteOutPhotos.every((url: any) => typeof url === 'string');
        if (!allStrings) {
          console.error("FOLLOW_UP_SERVICE: ERROR - Not all photo URLs are strings, forcing conversion");
          firestoreUpdates.siteOutPhotos = firestoreUpdates.siteOutPhotos.map((url: any) => String(url));
        }
      }

      // Remove undefined values to prevent Firestore errors
      Object.keys(firestoreUpdates).forEach(key => {
        if (firestoreUpdates[key] === undefined) {
          delete firestoreUpdates[key];
        }
      });

      await docRef.update(firestoreUpdates);

      const updatedDoc = await docRef.get();
      if (!updatedDoc.exists) {
        throw new Error('Follow-up visit not found after update');
      }

      const result = {
        id: updatedDoc.id,
        ...this.convertFirestoreToFollowUp(updatedDoc.data()!)
      };

      return result;
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error updating follow-up with status management:', error);
      throw new Error(`Failed to update follow-up visit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get follow-up by ID
   */
  async getFollowUpById(id: string): Promise<FollowUpSiteVisit | null> {
    try {
      const doc = await this.collection.doc(id).get();
      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...this.convertFirestoreToFollowUp(doc.data()!)
      };
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-up:', error);
      return null;
    }
  }

  /**
   * Get all follow-ups for an original visit
   */
  async getFollowUpsByOriginalVisit(originalVisitId: string): Promise<FollowUpSiteVisit[]> {
    try {
      const snapshot = await this.collection
        .where('originalVisitId', '==', originalVisitId)
        .get();

      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...this.convertFirestoreToFollowUp(doc.data())
      }));

      return docs.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime; // Most recent first
      });
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-ups for original visit:', error);
      return [];
    }
  }

  /**
   * Get ALL follow-ups (for admin/monitoring purposes)
   */
  async getAllFollowUps(): Promise<FollowUpSiteVisit[]> {
    try {
      // Fetch ALL follow-ups without userId filter (for admin monitoring)
      const snapshot = await this.collection.get();

      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...this.convertFirestoreToFollowUp(doc.data())
      }));

      return docs.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime; // Most recent first
      });
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting all follow-ups:', error);
      return [];
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
      // Simple query to avoid index issues
      const snapshot = await this.collection.where('userId', '==', userId).get();

      // Filter and map in memory
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...this.convertFirestoreToFollowUp(doc.data())
      })).filter(doc => {
        // Apply additional filters in memory
        if (department && doc.department !== department) return false;
        if (status && doc.status !== status) return false;
        return true;
      });

      return docs.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime; // Most recent first
      });
    } catch (error) {
      console.error('FOLLOW_UP_SERVICE: Error getting follow-ups by user:', error);
      return [];
    }
  }

  /**
   * Helper method to convert siteOutPhotos from Firestore format
   * FIXED: Handle both string arrays and complex photo objects
   */
  private convertSiteOutPhotos(siteOutPhotos: any): any[] {
    if (!Array.isArray(siteOutPhotos)) {
      return [];
    }

    // For follow-ups, siteOutPhotos are stored as simple string URLs
    // For regular site visits, they might be complex objects
    return siteOutPhotos.map((photo: any) => {
      if (typeof photo === 'string') {
        // Simple string URL format - return as-is for follow-ups
        return photo;
      } else if (photo && typeof photo === 'object') {
        // Complex photo object format - convert timestamp
        return {
          ...photo,
          timestamp: photo.timestamp?.toDate ? photo.timestamp.toDate() : new Date(photo.timestamp || Date.now())
        };
      } else {
        // Invalid format - return empty string or skip
        console.warn('FOLLOW_UP_SERVICE: Invalid siteOutPhotos format:', photo);
        return null;
      }
    }).filter(Boolean); // Remove any null values
  }

  /**
   * Convert Firestore document to FollowUpSiteVisit object
   */
  private convertFirestoreToFollowUp(data: any): Omit<FollowUpSiteVisit, 'id'> {
    return {
      originalVisitId: data.originalVisitId,
      userId: data.userId,
      department: data.department,
      siteInTime: data.siteInTime?.toDate() || new Date(),
      siteInLocation: data.siteInLocation,
      siteInPhotoUrl: data.siteInPhotoUrl,
      siteOutTime: data.siteOutTime?.toDate() || undefined,
      siteOutLocation: data.siteOutLocation,
      siteOutPhotoUrl: data.siteOutPhotoUrl,
      siteOutPhotos: this.convertSiteOutPhotos(data.siteOutPhotos || []),
      followUpReason: data.followUpReason,
      description: data.description,
      sitePhotos: data.sitePhotos || [],
      status: data.status || 'in_progress',
      notes: data.notes,
      customer: data.customer,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),

      // Dynamic Status Management fields
      originalCustomerStatus: data.originalCustomerStatus,
      affectsCustomerStatus: data.affectsCustomerStatus ?? true,
      newCustomerStatus: data.newCustomerStatus,

      // Optional visit outcome fields
      visitOutcome: data.visitOutcome,
      outcomeNotes: data.outcomeNotes,
      scheduledFollowUpDate: data.scheduledFollowUpDate?.toDate(),
      outcomeSelectedAt: data.outcomeSelectedAt?.toDate(),
      outcomeSelectedBy: data.outcomeSelectedBy
    };
  }
}

// Export singleton instance
export const followUpService = new FollowUpService();