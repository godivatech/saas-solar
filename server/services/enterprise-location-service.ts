/**
 * Enterprise Location Recognition Service
 * High-precision geolocation with indoor GPS compensation and device-aware validation
 */

import { storage } from '../storage';

export interface LocationRequest {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  userId: string;
  deviceInfo?: {
    type: 'mobile' | 'tablet' | 'desktop';
    userAgent?: string;
    locationCapability: 'excellent' | 'good' | 'limited' | 'poor';
  };
}

export interface LocationValidationResult {
  isValid: boolean;
  confidence: number;
  distance: number;
  detectedOffice: {
    id: string;
    name: string;
    distance: number;
  } | null;
  validationType: 'exact' | 'indoor_compensation' | 'proximity_based' | 'failed';
  message: string;
  recommendations: string[];
  metadata: {
    accuracy: number;
    effectiveRadius: number;
    indoorDetection: boolean;
    confidenceFactors: string[];
  };
}

export class EnterpriseLocationService {
  // Precision thresholds for enterprise-grade accuracy (more realistic for mobile devices)
  private static readonly PRECISION_EXCELLENT = 10;   // meters
  private static readonly PRECISION_GOOD = 50;        // meters  
  private static readonly PRECISION_FAIR = 200;       // meters
  private static readonly PRECISION_POOR = 500;       // meters
  
  // Indoor GPS compensation parameters - very aggressive for real-world usage
  private static readonly INDOOR_ACCURACY_THRESHOLD = 50;      // meters - trigger indoor mode sooner
  private static readonly INDOOR_DISTANCE_MULTIPLIER = 20.0;   // Allow 20x base radius indoors
  private static readonly POOR_GPS_THRESHOLD = 200;            // meters - trigger poor GPS mode sooner  
  private static readonly POOR_GPS_MULTIPLIER = 25.0;          // Allow 25x base radius for very poor GPS

  /**
   * Get device-aware validation radius based on device type and base radius
   */
  private static getDeviceAwareRadius(baseRadius: number, deviceInfo?: LocationRequest['deviceInfo']): number {
    if (!deviceInfo) return baseRadius * 2.0; // Default fallback
    
    switch (deviceInfo.locationCapability) {
      case 'excellent': // Mobile devices with GPS
        return baseRadius; // Strict validation for mobile
      case 'good': // Tablets with GPS/WiFi
        return baseRadius * 1.5;
      case 'limited': // Touch laptops with WiFi positioning
        return baseRadius * 2.5;
      case 'poor': // Desktops with WiFi/IP positioning
        return baseRadius * 3.0;
      default:
        return baseRadius * 2.0;
    }
  }

  /**
   * Get device-specific confidence multiplier
   */
  private static getDeviceConfidenceMultiplier(accuracy: number, deviceInfo?: LocationRequest['deviceInfo']): number {
    if (!deviceInfo) return 0.8; // Default fallback
    
    const expectedAccuracy = this.getExpectedAccuracyForDevice(deviceInfo);
    
    if (accuracy <= expectedAccuracy.typical) {
      return 1.0; // Full confidence
    } else if (accuracy <= expectedAccuracy.max) {
      return 0.85; // Good confidence
    } else {
      return 0.7; // Reduced confidence but still acceptable for device type
    }
  }

  /**
   * Get expected accuracy range for device type
   */
  private static getExpectedAccuracyForDevice(deviceInfo: LocationRequest['deviceInfo']): { 
    min: number; 
    max: number; 
    typical: number 
  } {
    if (!deviceInfo) return { min: 50, max: 500, typical: 200 };
    
    switch (deviceInfo.locationCapability) {
      case 'excellent': // Mobile with GPS
        return { min: 3, max: 20, typical: 10 };
      case 'good': // Tablet with GPS/WiFi
        return { min: 10, max: 50, typical: 25 };
      case 'limited': // Touch laptop with WiFi
        return { min: 50, max: 200, typical: 100 };
      case 'poor': // Desktop with WiFi/IP
        return { min: 100, max: 1000, typical: 300 };
      default:
        return { min: 50, max: 500, typical: 200 };
    }
  }

  /**
   * Calculate precise distance between two coordinates using Haversine formula
   */
  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  /**
   * Advanced office detection with smart indoor compensation
   */
  static async validateOfficeLocation(request: LocationRequest): Promise<LocationValidationResult> {
    console.log('LOCATION VALIDATION: Starting validation for user', request.userId);
    console.log('LOCATION VALIDATION: Request coordinates:', request.latitude, request.longitude);
    console.log('LOCATION VALIDATION: GPS accuracy:', request.accuracy);
    
    const officeLocations = await storage.listOfficeLocations();
    console.log('LOCATION VALIDATION: Found', officeLocations.length, 'office locations');
    
    if (officeLocations.length === 0) {
      console.log('LOCATION VALIDATION: No office locations configured, validation failed');
      return {
        isValid: false,
        confidence: 0,
        distance: 0,
        detectedOffice: null,
        validationType: 'failed',
        message: 'No office locations configured',
        recommendations: ['Contact administrator to configure office locations'],
        metadata: {
          accuracy: request.accuracy,
          effectiveRadius: 0,
          indoorDetection: false,
          confidenceFactors: ['no_office_locations']
        }
      };
    }

    let closestOffice = null;
    let minDistance = Infinity;
    let bestValidation: LocationValidationResult | null = null;

    // Test against all office locations
    for (const office of officeLocations) {
      console.log('LOCATION VALIDATION: Testing office:', office.name);
      console.log('LOCATION VALIDATION: Office coordinates:', office.latitude, office.longitude);
      console.log('LOCATION VALIDATION: Office radius:', office.radius || 100);
      
      const distance = this.calculateDistance(
        request.latitude,
        request.longitude,
        parseFloat(office.latitude),
        parseFloat(office.longitude)
      );

      console.log('LOCATION VALIDATION: Distance to office:', Math.round(distance), 'meters');

      if (distance < minDistance) {
        minDistance = distance;
        closestOffice = office;
        console.log('LOCATION VALIDATION: New closest office:', office.name, 'at', Math.round(distance), 'meters');
      }

      // Validate against this specific office
      const validation = this.validateAgainstOffice(request, office, distance);
      console.log('LOCATION VALIDATION: Validation result:', {
        isValid: validation.isValid,
        type: validation.validationType,
        confidence: validation.confidence,
        message: validation.message
      });
      
      if (validation.isValid && (!bestValidation || validation.confidence > bestValidation.confidence)) {
        bestValidation = validation;
        console.log('LOCATION VALIDATION: New best validation with confidence:', validation.confidence);
      }
    }

    // If we found a valid office, return that validation
    if (bestValidation) {
      return bestValidation;
    }

    // No valid office found, return validation for closest office
    if (closestOffice) {
      return this.validateAgainstOffice(request, closestOffice, minDistance);
    }

    // Fallback case
    return {
      isValid: false,
      confidence: 0,
      distance: minDistance,
      detectedOffice: null,
      validationType: 'failed',
      message: 'Location validation failed',
      recommendations: ['Move closer to office premises', 'Ensure location services are enabled'],
      metadata: {
        accuracy: request.accuracy,
        effectiveRadius: 0,
        indoorDetection: false,
        confidenceFactors: ['no_office_match']
      }
    };
  }

  /**
   * Validate location against a specific office with smart detection
   */
  private static validateAgainstOffice(
    request: LocationRequest, 
    office: any, 
    distance: number
  ): LocationValidationResult {
    const baseRadius = office.radius || 100;
    const confidenceFactors: string[] = [];
    let confidence = 0;
    let validationType: 'exact' | 'indoor_compensation' | 'proximity_based' | 'failed' = 'failed';
    let isValid = false;
    let message = '';
    const recommendations: string[] = [];

    // Get device-aware validation radius
    const deviceAwareRadius = this.getDeviceAwareRadius(baseRadius, request.deviceInfo);
    const deviceConfidenceMultiplier = this.getDeviceConfidenceMultiplier(request.accuracy, request.deviceInfo);
    
    console.log('DEVICE-AWARE VALIDATION:', {
      deviceType: request.deviceInfo?.type || 'unknown',
      locationCapability: request.deviceInfo?.locationCapability || 'unknown',
      baseRadius,
      deviceAwareRadius,
      distance: Math.round(distance),
      accuracy: Math.round(request.accuracy),
      confidenceMultiplier: deviceConfidenceMultiplier
    });

    // Determine GPS quality
    const isExcellentGPS = request.accuracy <= this.PRECISION_EXCELLENT;
    const isGoodGPS = request.accuracy <= this.PRECISION_GOOD;
    const isFairGPS = request.accuracy <= this.PRECISION_FAIR;
    const isPoorGPS = request.accuracy <= this.PRECISION_POOR;
    const isVeryPoorGPS = request.accuracy > this.PRECISION_POOR;

    // Device-aware base radius validation
    if (distance <= baseRadius) {
      isValid = true;
      validationType = 'exact';
      confidence = (isExcellentGPS ? 0.95 : isGoodGPS ? 0.9 : isFairGPS ? 0.8 : 0.7) * deviceConfidenceMultiplier;
      message = `Perfect office location match. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('within_base_radius');
      
      if (request.deviceInfo?.type) confidenceFactors.push(`device_${request.deviceInfo.type}`);
      if (isExcellentGPS) confidenceFactors.push('excellent_gps');
      else if (isGoodGPS) confidenceFactors.push('good_gps');
      else if (isFairGPS) confidenceFactors.push('fair_gps');
      else confidenceFactors.push('poor_gps_but_close');
    }
    // Device-aware extended radius validation
    else if (distance <= deviceAwareRadius) {
      isValid = true;
      validationType = request.deviceInfo?.type === 'mobile' ? 'indoor_compensation' : 'proximity_based';
      confidence = 0.85 * deviceConfidenceMultiplier;
      
      if (request.deviceInfo?.type === 'mobile') {
        message = `Indoor location detected with GPS compensation. Distance: ${Math.round(distance)}m`;
        confidenceFactors.push('mobile_indoor_compensation');
        recommendations.push('GPS accuracy is limited indoors - location validated successfully');
      } else {
        message = `Office location verified using network positioning. Distance: ${Math.round(distance)}m`;
        confidenceFactors.push('desktop_network_positioning');
        recommendations.push('Network-based positioning working normally for office location');
      }
      
      confidenceFactors.push(`device_aware_validation_${request.deviceInfo?.locationCapability || 'default'}`);
    }
    // Aggressive indoor GPS compensation for any poor accuracy
    else if (request.accuracy >= this.INDOOR_ACCURACY_THRESHOLD && distance <= baseRadius * this.INDOOR_DISTANCE_MULTIPLIER) {
      isValid = true;
      validationType = 'indoor_compensation';
      confidence = 0.85;
      message = `Indoor location detected with GPS compensation. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('indoor_gps_compensation');
      recommendations.push('GPS accuracy is limited indoors - location validated successfully');
    }
    // Very aggressive poor GPS compensation - assume indoor if GPS is bad
    else if (request.accuracy >= this.POOR_GPS_THRESHOLD && distance <= baseRadius * this.POOR_GPS_MULTIPLIER) {
      isValid = true;
      validationType = 'proximity_based';
      confidence = 0.80;
      message = `Poor GPS signal - assuming indoor office location. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('poor_gps_indoor_assumption');
      recommendations.push('Poor GPS signal typically indicates indoor location');
    }
    // Extra lenient validation for any moderately poor GPS (like 467m accuracy)
    else if (request.accuracy >= 50 && distance <= baseRadius * 8.0) {
      isValid = true;
      validationType = 'indoor_compensation';
      confidence = 0.75;
      message = `Moderate GPS accuracy - likely indoor. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('moderate_gps_indoor_likely');
      recommendations.push('GPS accuracy suggests indoor location');
    }
    // Very lenient validation for poor GPS signals (400m+ accuracy)
    else if (request.accuracy >= 400 && distance <= baseRadius * 15.0) {
      isValid = true;
      validationType = 'indoor_compensation';
      confidence = 0.70;
      message = `Poor GPS signal detected - assuming indoor office location. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('very_poor_gps_indoor_assumption');
      recommendations.push('Poor GPS signal is normal for indoor locations');
    }
    // Close proximity with good GPS (edge case)
    else if (distance <= baseRadius * 1.5 && isGoodGPS) {
      isValid = true;
      validationType = 'proximity_based';
      confidence = 0.65;
      message = `Close proximity to office detected. Distance: ${Math.round(distance)}m`;
      confidenceFactors.push('close_proximity_good_gps');
    }
    // Failed validation
    else {
      isValid = false;
      validationType = 'failed';
      confidence = 0;
      message = `Outside office premises. Distance: ${Math.round(distance)}m (limit: ${baseRadius}m)`;
      
      if (isVeryPoorGPS) {
        recommendations.push('GPS accuracy is very poor - try moving to an open area');
        recommendations.push('Ensure location services are enabled');
        confidenceFactors.push('very_poor_gps');
      } else {
        recommendations.push(`Move closer to office (currently ${Math.round(distance)}m away)`);
        confidenceFactors.push('outside_range');
      }
    }

    // Calculate effective radius used for validation
    let effectiveRadius = baseRadius;
    if (validationType === 'indoor_compensation') {
      effectiveRadius = baseRadius * this.INDOOR_DISTANCE_MULTIPLIER;
    } else if (validationType === 'proximity_based' && isVeryPoorGPS) {
      effectiveRadius = baseRadius * this.POOR_GPS_MULTIPLIER;
    }

    const detectedOffice = isValid ? {
      id: office.id,
      name: office.name,
      distance: Math.round(distance)
    } : null;

    return {
      isValid,
      confidence,
      distance: Math.round(distance),
      detectedOffice,
      validationType,
      message,
      recommendations,
      metadata: {
        accuracy: request.accuracy,
        effectiveRadius: Math.round(effectiveRadius),
        indoorDetection: validationType === 'indoor_compensation',
        confidenceFactors
      }
    };
  }

  /**
   * Log location validation for analytics and security
   */
  static async logLocationValidation(
    userId: string,
    result: LocationValidationResult,
    attendanceType: string
  ): Promise<void> {
    try {
      await storage.createActivityLog({
        type: 'attendance',
        title: `Location Validation - ${result.validationType}`,
        description: `${attendanceType} check-in validation: ${result.message} (Confidence: ${Math.round(result.confidence * 100)}%)`,
        entityId: userId,
        entityType: 'user',
        userId: userId
      });
    } catch (error) {
      console.error('Failed to log location validation:', error);
    }
  }

  /**
   * Get location recommendations based on current GPS state
   */
  static getLocationRecommendations(accuracy: number): string[] {
    const recommendations: string[] = [];
    
    if (accuracy > this.PRECISION_POOR) {
      recommendations.push('GPS accuracy is very poor - try these steps:');
      recommendations.push('• Move to an open area away from buildings');
      recommendations.push('• Restart your location services');
      recommendations.push('• Check if location permissions are granted');
    } else if (accuracy > this.PRECISION_FAIR) {
      recommendations.push('GPS accuracy is limited - try these steps:');
      recommendations.push('• Move closer to a window if indoors');
      recommendations.push('• Wait a moment for GPS to improve');
    } else if (accuracy > this.PRECISION_GOOD) {
      recommendations.push('GPS accuracy is moderate - location detected successfully');
    } else {
      recommendations.push('Excellent GPS accuracy - location precisely detected');
    }
    
    return recommendations;
  }
}